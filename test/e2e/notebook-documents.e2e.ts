/**
 * Test end-to-end RÉEL du domaine Notebook-Documents — Goals 1+2+3 : cycle de vie complet
 * AVEC ingestion réelle (extraction PDF + embeddings + indexation pgvector).
 *
 * Comme notebooks-folders.e2e.ts : tape le VRAI serveur en HTTP et vérifie la conformité au
 * contrat openapi.yaml. En plus ici : le circuit ASYNCHRONE complet (202 → polling jobs →
 * ready), puis le TEST DE COMPAT slim de la frontière RAG (arbitrage goal 3) — les embeddings
 * écrits par la V2 ont le shape legacy exact et sont visibles de la couche retrieval — et
 * l'IDEMPOTENCE au retry (re-run du job → pas de doublons).
 *
 * PRÉREQUIS
 *   - Backend qui tourne (`yarn start:dev`, localhost:3100), migrations 005→008 appliquées.
 *   - Worker actif (JOBS_WORKER_ENABLED != false), S3_* configurées, OPENAI_API_KEY côté
 *     serveur (les embeddings sont réellement calculés — coût négligeable, 2 petits chunks).
 *   - Un utilisateur de test existant et confirmé dans le projet Supabase de test.
 *
 * VARIABLES D'ENV REQUISES (identiques à notebooks-folders.e2e.ts)
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
 *   E2E_BASE_URL (optionnel, défaut http://localhost:3100)
 *   OPENAI_API_KEY (optionnel CÔTÉ TEST : active la vérification search_vectors complète —
 *     il faut vectoriser la requête ; sinon le retrieval est vérifié via get_random_embeddings)
 *
 * LANCER
 *   npx ts-node test/e2e/notebook-documents.e2e.ts
 *
 * NETTOYAGE
 *   - Ligne documents supprimée en dur (client authentifié, policy documents_owner) → les
 *     embeddings partent par CASCADE ; notebook et job supprimés pareil.
 *   - Objet S3 : PAS supprimé (pas de credentials S3 côté test) — orphelin assumé dans le
 *     bucket de test, à purger au DELETE document (hors périmètre, v2-socle-debt.md §5).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_ID = Date.now();
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 60_000;

function requireEnv(): void {
  const missing = ['SUPABASE_URL', 'SUPABASE_ANON_KEY', 'TEST_USER_EMAIL', 'TEST_USER_PASSWORD'].filter(
    (k) => !process.env[k],
  );
  if (missing.length) {
    console.error(`❌ Variables d'env manquantes : ${missing.join(', ')} (voir l'en-tête du fichier).`);
    process.exit(2);
  }
}

// ── HTTP ─────────────────────────────────────────────────────────────────────
interface ApiResponse {
  status: number;
  body: any;
  raw: string;
}

async function api(
  method: string,
  path: string,
  opts: { token?: string; body?: unknown; form?: FormData } = {},
): Promise<ApiResponse> {
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.form ?? (opts.body !== undefined ? JSON.stringify(opts.body) : undefined),
  });
  const raw = await res.text();
  let body: any;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  return { status: res.status, body, raw };
}

/**
 * Multipart d'upload : la VRAIE fixture 2 pages (celle des tests unitaires de l'extracteur) —
 * l'ingestion est réelle depuis le goal 2, il faut un PDF avec du texte extractible.
 */
const FIXTURE_PDF = readFileSync(join(__dirname, '..', 'fixtures', 'sample-2pages.pdf'));

function pdfForm(fields: Record<string, string> = {}): FormData {
  const form = new FormData();
  form.append('file', new Blob([FIXTURE_PDF], { type: 'application/pdf' }), `e2e-${RUN_ID}.pdf`);
  form.append('kind', 'pdf');
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  return form;
}

// ── Assertions ───────────────────────────────────────────────────────────────
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertStatus(res: ApiResponse, expected: number): void {
  assert(res.status === expected, `HTTP ${expected} attendu, reçu ${res.status} (body: ${res.raw?.slice(0, 200)})`);
}

const DOCUMENT_FIELDS = ['id', 'label', 'kind', 'uploadedAt', 'processingStatus'];
const DOCUMENT_INTERNAL = [
  'user_id',
  'url',
  'container_id',
  'ingest_job_id',
  'ingest_job',
  'name',
  'type',
  'created_at',
];
const JOB_STATUSES = ['pending', 'processing', 'ready', 'failed'];
const JOB_STAGES = ['transcribing', 'chunking', 'indexing'];

function assertDocumentShape(doc: any): void {
  assert(doc && typeof doc === 'object', 'NotebookDocument: objet attendu');
  for (const k of DOCUMENT_FIELDS) assert(k in doc, `NotebookDocument: champ contrat manquant "${k}"`);
  for (const k of DOCUMENT_INTERNAL) assert(!(k in doc), `NotebookDocument: FUITE de colonne interne "${k}"`);
  assert(JOB_STATUSES.includes(doc.processingStatus), `processingStatus invalide: ${doc.processingStatus}`);
}

function assertErrorShape(res: ApiResponse, expectedCode: string): void {
  assert(res.body && typeof res.body === 'object', 'Erreur: body objet attendu');
  assert(typeof res.body.message === 'string', 'Erreur: message string attendu');
  assert(res.body.code === expectedCode, `Erreur: code "${expectedCode}" attendu, reçu "${res.body.code}"`);
}

function assertJobShape(job: any): void {
  assert(typeof job.jobId === 'string', 'Job.jobId string attendu');
  assert(JOB_STATUSES.includes(job.status), `Job.status invalide: ${job.status}`);
  assert(job.resourceType === 'document', `Job.resourceType "document" attendu, reçu "${job.resourceType}"`);
  if (job.stage !== undefined) assert(JOB_STAGES.includes(job.stage), `Job.stage invalide: ${job.stage}`);
  for (const internal of ['user_id', 'payload', 'attempts', 'locked_at']) {
    assert(!(internal in job), `Job: FUITE de colonne interne "${internal}"`);
  }
}

/** Polling GET /v1/jobs/:jobId jusqu'à ready/failed, avec assertions de shape à chaque tour. */
async function pollUntilDone(jobId: string, token: string): Promise<{ job: any; seenStatuses: Set<string> }> {
  const seenStatuses = new Set<string>();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await api('GET', `/v1/jobs/${jobId}`, { token });
    assertStatus(res, 200);
    assertJobShape(res.body);
    seenStatuses.add(res.body.status);
    if (res.body.status === 'ready' || res.body.status === 'failed') {
      return { job: res.body, seenStatuses };
    }
    assert(Date.now() < deadline, `Timeout: job ${jobId} toujours "${res.body.status}" après ${POLL_TIMEOUT_MS}ms`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

/** Clés EXACTES du metadata legacy (`ai.service.ts:105-111`) — le cœur du test de compat. */
const LEGACY_METADATA_KEYS = ['document_id', 'page_number', 'duration', 'start', 'end'];

// ── Scénario ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  requireEnv();

  console.log(`\n▶ e2e notebook-documents (goals 1+2+3) — run ${RUN_ID} sur ${BASE_URL}\n`);

  // 1. Token frais du user de test
  const supabase: SupabaseClient = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL as string,
    password: TEST_USER_PASSWORD as string,
  });
  assert(!authError && auth?.session, `Login du user de test impossible : ${authError?.message}`);
  const token = auth.session.access_token;
  console.log(`✔ 1. Token obtenu (user ${auth.user?.id})`);

  // 2. 401 sans token (garde globale, format d'erreur contrat)
  const anon = await api('GET', '/v1/notebooks');
  assertStatus(anon, 401);
  console.log('✔ 2. 401 sans Bearer');

  // 3. Notebook de travail
  const created = await api('POST', '/v1/notebooks', { token, body: { title: `e2e-docs-${RUN_ID}` } });
  assertStatus(created, 201);
  const notebookId: string = created.body.id;
  console.log(`✔ 3. Notebook créé (${notebookId})`);

  let documentId = '';
  let jobId = '';
  try {
    // 4. Liste vide au départ (tableau nu)
    const empty = await api('GET', `/v1/notebooks/${notebookId}/documents`, { token });
    assertStatus(empty, 200);
    assert(Array.isArray(empty.body) && empty.body.length === 0, 'Liste initiale vide attendue (tableau nu)');
    console.log('✔ 4. Liste initiale vide');

    // 5. Upload → 202 DocumentJobAccepted
    const accepted = await api('POST', `/v1/notebooks/${notebookId}/documents`, { token, form: pdfForm() });
    assertStatus(accepted, 202);
    assert(typeof accepted.body.jobId === 'string', '202.jobId string attendu');
    assert(typeof accepted.body.documentId === 'string', '202.documentId string attendu');
    assert(
      Number.isInteger(accepted.body.estimatedSeconds) && accepted.body.estimatedSeconds >= 1,
      '202.estimatedSeconds entier >= 1 attendu',
    );
    documentId = accepted.body.documentId;
    jobId = accepted.body.jobId;
    console.log(`✔ 5. Upload accepté (202) — document ${documentId}, job ${jobId}`);

    // 6. Le document existe immédiatement dans la liste (pending/processing/ready)
    const during = await api('GET', `/v1/notebooks/${notebookId}/documents`, { token });
    assertStatus(during, 200);
    const listed = during.body.find((d: any) => d.id === documentId);
    assert(listed, 'Le document doit apparaître dans la liste immédiatement après le 202');
    assertDocumentShape(listed);
    console.log(`✔ 6. Document listé immédiatement (processingStatus=${listed.processingStatus})`);

    // 7. Polling GET /v1/jobs/:jobId jusqu'à ready (circuit asynchrone complet)
    const { job, seenStatuses } = await pollUntilDone(jobId, token);
    assert(job.status === 'ready', `Job attendu "ready", obtenu "${job.status}" (error: ${job.error})`);
    assert(job.resourceId === documentId, `Job.resourceId doit valoir documentId (reçu ${job.resourceId})`);
    assert(job.progress === 100, `Job.progress 100 attendu à ready (reçu ${job.progress})`);
    console.log(`✔ 7. Job ready (statuts observés : ${[...seenStatuses].join(' → ')})`);

    // 8. Liste → processingStatus ready
    const after = await api('GET', `/v1/notebooks/${notebookId}/documents`, { token });
    const readyDoc = after.body.find((d: any) => d.id === documentId);
    assert(
      readyDoc?.processingStatus === 'ready',
      `processingStatus "ready" attendu en liste (reçu ${readyDoc?.processingStatus})`,
    );
    console.log('✔ 8. Liste : processingStatus=ready');

    // 9. COMPAT (goal 3) : les embeddings V2 ont le shape legacy exact
    const { data: embeddings, error: embError } = await supabase
      .from('embeddings')
      .select('id, content, metadata, embedding, token')
      .eq('document_id', documentId);
    assert(!embError, `Lecture embeddings impossible : ${embError?.message}`);
    assert(embeddings && embeddings.length === 2, `2 embeddings attendus (2 pages), reçu ${embeddings?.length}`);
    for (const row of embeddings!) {
      assert(row.embedding != null, 'embedding (vecteur) manquant');
      assert(
        typeof row.content === 'string' && row.content.length > 0 && row.content.length <= 1000,
        `content hors bornes splitter (${row.content?.length} chars)`,
      );
      const keys = Object.keys(row.metadata ?? {}).sort();
      assert(
        JSON.stringify(keys) === JSON.stringify([...LEGACY_METADATA_KEYS].sort()),
        `metadata: clés legacy exactes attendues, reçu [${keys.join(', ')}]`,
      );
      assert(row.metadata.document_id === documentId, 'metadata.document_id doit valoir documentId');
    }
    const pages = embeddings!.map((r: any) => r.metadata.page_number).sort();
    assert(JSON.stringify(pages) === JSON.stringify([1, 2]), `page_number [1,2] attendu, reçu [${pages}]`);
    console.log('✔ 9. Embeddings compat legacy (2 chunks, metadata exact, vecteurs présents)');

    // 10. RETRIEVAL : la couche RPC pgvector voit le document V2
    const { data: randomPieces, error: rpcError } = await supabase.rpc('get_random_embeddings', {
      query_document_id: documentId,
      match_count: 2,
    });
    assert(!rpcError, `RPC get_random_embeddings en erreur : ${rpcError?.message}`);
    assert(Array.isArray(randomPieces) && randomPieces.length > 0, 'get_random_embeddings doit retourner des passages');
    console.log(`✔ 10. Retrieval RPC ok (${randomPieces.length} passages)`);

    // 11. search_vectors complet (optionnel : nécessite OPENAI_API_KEY côté test pour vectoriser la requête)
    if (process.env.OPENAI_API_KEY) {
      const embRes = await fetch('https://api.openai.com/v1/embeddings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
        body: JSON.stringify({ model: 'text-embedding-3-small', input: 'hello page one', encoding_format: 'float' }),
      });
      assert(embRes.ok, `OpenAI embeddings HTTP ${embRes.status}`);
      const queryVector = (await embRes.json()).data[0].embedding;
      const { data: pieces, error: svError } = await supabase.rpc('search_vectors', {
        query_embedding: queryVector,
        query_document_id: documentId,
        match_count: 2,
      });
      assert(!svError, `RPC search_vectors en erreur : ${svError?.message}`);
      assert(Array.isArray(pieces) && pieces.length > 0, 'search_vectors doit retourner des passages du doc V2');
      console.log(`✔ 11. search_vectors ok (${pieces.length} passages) — le chat legacy voit le doc V2`);
    } else {
      console.log('· 11. search_vectors sauté (OPENAI_API_KEY absente côté test) — couvert par get_random_embeddings');
    }

    // 12. IDEMPOTENCE au retry : re-run du même job → PAS de doublons (purge avant ré-index)
    const { error: requeueError } = await supabase
      .from('jobs')
      .update({ status: 'pending', resource_id: null, progress: null })
      .eq('id', jobId);
    assert(!requeueError, `Re-mise en pending impossible : ${requeueError?.message}`);
    const rerun = await pollUntilDone(jobId, token);
    assert(rerun.job.status === 'ready', `Re-run attendu "ready", obtenu "${rerun.job.status}" (${rerun.job.error})`);
    const { data: after2ndRun } = await supabase.from('embeddings').select('id').eq('document_id', documentId);
    assert(
      after2ndRun?.length === 2,
      `DOUBLONS après retry : ${after2ndRun?.length} embeddings au lieu de 2 (purge défaillante)`,
    );
    console.log('✔ 12. Idempotence : re-run du job, toujours 2 embeddings (purge OK)');

    // 13. NotebookDetail embarque le document
    const detail = await api('GET', `/v1/notebooks/${notebookId}`, { token });
    assertStatus(detail, 200);
    assert(Array.isArray(detail.body.documents), 'NotebookDetail.documents tableau attendu');
    assert(
      detail.body.documents.some((d: any) => d.id === documentId),
      'NotebookDetail doit contenir le document',
    );
    console.log('✔ 13. NotebookDetail contient le document');

    // 14. PATCH rename
    const renamed = await api('PATCH', `/v1/notebooks/${notebookId}/documents/${documentId}`, {
      token,
      body: { label: `renommé-${RUN_ID}` },
    });
    assertStatus(renamed, 200);
    assertDocumentShape(renamed.body);
    assert(renamed.body.label === `renommé-${RUN_ID}`, 'label renommé attendu');
    console.log('✔ 14. PATCH rename');

    // 15. Erreurs contrat
    const badKind = await api('POST', `/v1/notebooks/${notebookId}/documents`, {
      token,
      form: (() => {
        const f = pdfForm();
        f.set('kind', 'video');
        return f;
      })(),
    });
    assertStatus(badKind, 422);
    assertErrorShape(badKind, 'UNSUPPORTED_KIND');

    const ghost = '00000000-0000-4000-8000-000000000000';
    const notFound = await api('GET', `/v1/notebooks/${ghost}/documents`, { token });
    assertStatus(notFound, 404);
    assertErrorShape(notFound, 'NOT_FOUND');

    const unknownField = await api('PATCH', `/v1/notebooks/${notebookId}/documents/${documentId}`, {
      token,
      body: { label: 'x', hack: true },
    });
    assertStatus(unknownField, 422);
    console.log('✔ 15. Erreurs contrat : 422 UNSUPPORTED_KIND, 404 NOT_FOUND, 422 champ inconnu');

    // 16. DÉCOUPLAGE (migration 015) : une note liée au document SURVIT à sa suppression,
    //     avec sourceDocumentId → null ; les embeddings, eux, partent. C'est le critère de sortie.
    const linkedNote = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
      token,
      body: { title: `note-liée-${RUN_ID}`, body: 'Contenu écrit par le user.', sourceDocumentId: documentId },
    });
    assertStatus(linkedNote, 201);
    assert(linkedNote.body.sourceDocumentId === documentId, 'la note doit être liée au document');
    const noteId: string = linkedNote.body.id;

    const del = await api('DELETE', `/v1/notebooks/${notebookId}/documents/${documentId}`, { token });
    assertStatus(del, 204);

    // Le document a disparu…
    const gone = await api('GET', `/v1/notebooks/${notebookId}/documents`, { token });
    assert(!gone.body.some((d: any) => d.id === documentId), 'le document supprimé ne doit plus être listé');
    // …ses embeddings aussi (cascade)…
    const { data: embAfter } = await supabase.from('embeddings').select('id').eq('document_id', documentId);
    assert((embAfter?.length ?? 0) === 0, `embeddings non supprimés : ${embAfter?.length} restants`);
    // …mais la NOTE survit, délinkée.
    const survivor = await api('GET', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token });
    assertStatus(survivor, 200);
    assert(survivor.body.id === noteId, 'la note liée doit survivre à la suppression du document');
    assert(survivor.body.sourceDocumentId === null, 'sourceDocumentId doit être null après découplage');
    console.log('✔ 16. Découplage : document + embeddings supprimés, note survit (sourceDocumentId=null)');

    // 17. DELETE idempotent-honnête : re-DELETE → 404
    const reDel = await api('DELETE', `/v1/notebooks/${notebookId}/documents/${documentId}`, { token });
    assertStatus(reDel, 404);
    assertErrorShape(reDel, 'NOT_FOUND');
    documentId = ''; // déjà supprimé — le cleanup ne le retente pas
    console.log('✔ 17. Re-DELETE du document → 404');
  } finally {
    // 18. Nettoyage HARD des lignes créées pendant ce run (client authentifié, scopé RLS).
    // L'ordre compte : documents d'abord (les embeddings partent par CASCADE), puis le job
    // (la FK documents.ingest_job_id a disparu avec la ligne), puis le notebook.
    if (documentId) await supabase.from('documents').delete().eq('id', documentId);
    if (jobId) await supabase.from('jobs').delete().eq('id', jobId);
    await supabase.from('containers').delete().eq('id', notebookId);
    console.log('✔ 18. Nettoyage (document + embeddings CASCADE + job + notebook ; objet S3 orphelin assumé)');
  }

  console.log('\n✅ e2e notebook-documents : tout est conforme au contrat.\n');
}

main().catch((err) => {
  console.error(`\n❌ ÉCHEC e2e : ${err.message}\n`);
  process.exit(1);
});
