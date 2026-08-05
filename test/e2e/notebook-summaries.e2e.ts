/**
 * Test end-to-end RÉEL du domaine Notebook-Summaries — Goals 1+2 : génération asynchrone,
 * lecture, et suppression soft.
 *
 * Chaîné sur le pipeline Documents : upload de la fixture PDF → ingestion réelle (embeddings)
 * → génération d'un résumé DESSUS (2 vrais appels gpt-4o-mini) → polling jobs → lecture.
 * Vérifie la particularité contrat du 202 : PAS d'id de ressource (la ligne summary naît à la
 * complétion, `Job.resourceId` porte le lien), et l'absence de `stage` (réservé à l'ingestion).
 *
 * PRÉREQUIS
 *   - Backend qui tourne (`yarn start:dev`, localhost:3100), migrations 005→008 + 011 appliquées.
 *   - Worker actif, S3_* configurées, OPENAI_API_KEY côté serveur (ingestion ET génération).
 *   - Un utilisateur de test existant et confirmé dans le projet Supabase de test.
 *
 * VARIABLES D'ENV REQUISES (identiques aux autres e2e)
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
 *   E2E_BASE_URL (optionnel, défaut http://localhost:3100)
 *
 * LANCER
 *   npx ts-node test/e2e/notebook-summaries.e2e.ts
 *
 * NETTOYAGE : summary, document (embeddings CASCADE), jobs, notebooks — supprimés en dur via
 * PostgREST (client authentifié, policies owner). Objet S3 orphelin assumé (cf. e2e documents).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { join } from 'path';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_ID = Date.now();
const POLL_INTERVAL_MS = 1000;
const POLL_TIMEOUT_MS = 90_000; // 2 appels LLM réels — marge au-dessus des 60s de l'e2e documents

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

const FIXTURE_PDF = readFileSync(join(__dirname, '..', 'fixtures', 'sample-2pages.pdf'));

function pdfForm(): FormData {
  const form = new FormData();
  form.append('file', new Blob([FIXTURE_PDF], { type: 'application/pdf' }), `e2e-sum-${RUN_ID}.pdf`);
  form.append('kind', 'pdf');
  return form;
}

// ── Assertions ───────────────────────────────────────────────────────────────
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertStatus(res: ApiResponse, expected: number): void {
  assert(res.status === expected, `HTTP ${expected} attendu, reçu ${res.status} (body: ${res.raw?.slice(0, 200)})`);
}

function assertErrorShape(res: ApiResponse, expectedCode: string): void {
  assert(res.body && typeof res.body === 'object', 'Erreur: body objet attendu');
  assert(typeof res.body.message === 'string', 'Erreur: message string attendu');
  assert(res.body.code === expectedCode, `Erreur: code "${expectedCode}" attendu, reçu "${res.body.code}"`);
}

const SUMMARY_FIELDS = [
  'id',
  'notebookId',
  'title',
  'body',
  'wordCount',
  'generatedAt',
  'sourceDocumentIds',
  'length',
  'format',
];
const SUMMARY_INTERNAL = [
  'user_id',
  'container_id',
  'word_count',
  'source_document_ids',
  'deleted_at',
  'created_at',
  'updated_at',
];
const JOB_STATUSES = ['pending', 'processing', 'ready', 'failed'];

function assertSummaryShape(s: any): void {
  assert(s && typeof s === 'object', 'NotebookSummary: objet attendu');
  for (const k of SUMMARY_FIELDS) assert(k in s, `NotebookSummary: champ contrat manquant "${k}"`);
  for (const k of SUMMARY_INTERNAL) assert(!(k in s), `NotebookSummary: FUITE de colonne interne "${k}"`);
  assert(Number.isInteger(s.wordCount) && s.wordCount > 0, `wordCount entier > 0 attendu (reçu ${s.wordCount})`);
  assert(Array.isArray(s.sourceDocumentIds), 'sourceDocumentIds tableau attendu');
}

async function pollUntilDone(
  jobId: string,
  token: string,
  expectedResourceType: string,
): Promise<{ job: any; seenStatuses: Set<string> }> {
  const seenStatuses = new Set<string>();
  const deadline = Date.now() + POLL_TIMEOUT_MS;
  for (;;) {
    const res = await api('GET', `/v1/jobs/${jobId}`, { token });
    assertStatus(res, 200);
    assert(JOB_STATUSES.includes(res.body.status), `Job.status invalide: ${res.body.status}`);
    assert(
      res.body.resourceType === expectedResourceType,
      `Job.resourceType "${expectedResourceType}" attendu, reçu "${res.body.resourceType}"`,
    );
    if (expectedResourceType === 'summary') {
      assert(res.body.stage === undefined, `Job.stage doit rester absent pour un summary (reçu "${res.body.stage}")`);
    }
    seenStatuses.add(res.body.status);
    if (res.body.status === 'ready' || res.body.status === 'failed') {
      return { job: res.body, seenStatuses };
    }
    assert(Date.now() < deadline, `Timeout: job ${jobId} toujours "${res.body.status}" après ${POLL_TIMEOUT_MS}ms`);
    await new Promise((r) => setTimeout(r, POLL_INTERVAL_MS));
  }
}

// ── Scénario ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  requireEnv();

  console.log(`\n▶ e2e notebook-summaries (goals 1+2) — run ${RUN_ID} sur ${BASE_URL}\n`);

  // 1. Token frais du user de test
  const supabase: SupabaseClient = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL as string,
    password: TEST_USER_PASSWORD as string,
  });
  assert(!authError && auth?.session, `Login du user de test impossible : ${authError?.message}`);
  const token = auth.session.access_token;
  console.log(`✔ 1. Token obtenu (user ${auth.user?.id})`);

  // 2. Notebooks de travail (un avec doc, un vide pour NO_SOURCES)
  const created = await api('POST', '/v1/notebooks', { token, body: { title: `e2e-sum-${RUN_ID}` } });
  assertStatus(created, 201);
  const notebookId: string = created.body.id;
  const createdEmpty = await api('POST', '/v1/notebooks', { token, body: { title: `e2e-sum-empty-${RUN_ID}` } });
  assertStatus(createdEmpty, 201);
  const emptyNotebookId: string = createdEmpty.body.id;
  console.log(`✔ 2. Notebooks créés (${notebookId}, vide: ${emptyNotebookId})`);

  let documentId = '';
  let docJobId = '';
  let summaryJobId = '';
  let summaryId = '';
  try {
    // 3. Source : upload + ingestion réelle (pipeline Documents)
    const accepted = await api('POST', `/v1/notebooks/${notebookId}/documents`, { token, form: pdfForm() });
    assertStatus(accepted, 202);
    documentId = accepted.body.documentId;
    docJobId = accepted.body.jobId;
    const ingestion = await pollUntilDone(docJobId, token, 'document');
    assert(
      ingestion.job.status === 'ready',
      `Ingestion attendue ready (reçu ${ingestion.job.status}: ${ingestion.job.error})`,
    );
    console.log(`✔ 3. Document source ingéré (${documentId})`);

    // 4. Generate → 202 JobAccepted SIMPLE (pas d'id de ressource — la ligne naît à la complétion)
    const gen = await api('POST', `/v1/notebooks/${notebookId}/summaries/generate`, {
      token,
      body: { length: 'brief', format: 'bullet_points' },
    });
    assertStatus(gen, 202);
    assert(typeof gen.body.jobId === 'string', '202.jobId string attendu');
    assert(
      Number.isInteger(gen.body.estimatedSeconds) && gen.body.estimatedSeconds >= 1,
      '202.estimatedSeconds >= 1 attendu',
    );
    const extraKeys = Object.keys(gen.body).filter((k) => !['jobId', 'estimatedSeconds'].includes(k));
    assert(extraKeys.length === 0, `202 JobAccepted strict attendu — champs en trop : ${extraKeys.join(', ')}`);
    summaryJobId = gen.body.jobId;
    console.log(`✔ 4. Génération acceptée (202 strict, job ${summaryJobId})`);

    // 5. Polling → ready + resourceId (et jamais de stage sur un job summary)
    const { job, seenStatuses } = await pollUntilDone(summaryJobId, token, 'summary');
    assert(job.status === 'ready', `Job attendu "ready", obtenu "${job.status}" (error: ${job.error})`);
    assert(typeof job.resourceId === 'string', 'Job.resourceId attendu à ready (id du summary créé)');
    summaryId = job.resourceId;
    console.log(`✔ 5. Summary généré (statuts : ${[...seenStatuses].join(' → ')}, resourceId ${summaryId})`);

    // 6. GET détail — conforme au champ près
    const detail = await api('GET', `/v1/notebooks/${notebookId}/summaries/${summaryId}`, { token });
    assertStatus(detail, 200);
    assertSummaryShape(detail.body);
    assert(detail.body.notebookId === notebookId, 'notebookId doit référencer le notebook');
    assert(detail.body.sourceDocumentIds.includes(documentId), 'sourceDocumentIds doit contenir le document source');
    assert(
      detail.body.length === 'brief' && detail.body.format === 'bullet_points',
      'length/format doivent être renvoyés tels quels',
    );
    assert(detail.body.body.length > 0, 'body markdown non vide attendu');
    console.log(`✔ 6. Détail conforme ("${detail.body.title}", ${detail.body.wordCount} mots)`);

    // 7. GET liste — le summary y est, tableau nu
    const list = await api('GET', `/v1/notebooks/${notebookId}/summaries`, { token });
    assertStatus(list, 200);
    assert(Array.isArray(list.body), 'Liste : tableau nu attendu');
    assert(
      list.body.some((s: any) => s.id === summaryId),
      'La liste doit contenir le summary généré',
    );
    list.body.forEach(assertSummaryShape);
    console.log(`✔ 7. Liste (${list.body.length} summary/ies)`);

    // 8. Erreurs contrat
    const ghost = '00000000-0000-4000-8000-000000000000';
    const notFound = await api('POST', `/v1/notebooks/${ghost}/summaries/generate`, {
      token,
      body: { length: 'brief', format: 'paragraphs' },
    });
    assertStatus(notFound, 404);
    assertErrorShape(notFound, 'NOT_FOUND');

    const noSources = await api('POST', `/v1/notebooks/${emptyNotebookId}/summaries/generate`, {
      token,
      body: { length: 'brief', format: 'paragraphs' },
    });
    assertStatus(noSources, 422);
    assertErrorShape(noSources, 'NO_SOURCES');

    const foreignDoc = await api('POST', `/v1/notebooks/${notebookId}/summaries/generate`, {
      token,
      body: { documentIds: [ghost], length: 'brief', format: 'paragraphs' },
    });
    assertStatus(foreignDoc, 404);

    const unknownField = await api('POST', `/v1/notebooks/${notebookId}/summaries/generate`, {
      token,
      body: { length: 'brief', format: 'paragraphs', hack: true },
    });
    assertStatus(unknownField, 422);
    console.log('✔ 8. Erreurs contrat : 404 notebook/document, 422 NO_SOURCES, 422 champ inconnu');

    // 9. DELETE soft : 204 → détail 404 → absent de la liste → second DELETE 404 (goal 2)
    const deleted = await api('DELETE', `/v1/notebooks/${notebookId}/summaries/${summaryId}`, { token });
    assertStatus(deleted, 204);

    const goneDetail = await api('GET', `/v1/notebooks/${notebookId}/summaries/${summaryId}`, { token });
    assertStatus(goneDetail, 404);
    assertErrorShape(goneDetail, 'NOT_FOUND');

    const listAfter = await api('GET', `/v1/notebooks/${notebookId}/summaries`, { token });
    assertStatus(listAfter, 200);
    assert(!listAfter.body.some((s: any) => s.id === summaryId), 'Le summary supprimé ne doit plus être listé');

    const doubleDelete = await api('DELETE', `/v1/notebooks/${notebookId}/summaries/${summaryId}`, { token });
    assertStatus(doubleDelete, 404);
    assertErrorShape(doubleDelete, 'NOT_FOUND');

    // La ligne existe toujours en DB (soft-delete, deleted_at posé) — vérifié en direct.
    const { data: softRow } = await supabase.from('summaries').select('deleted_at').eq('id', summaryId).maybeSingle();
    assert(softRow && softRow.deleted_at !== null, 'SOFT-delete attendu : ligne présente avec deleted_at posé');
    console.log('✔ 9. DELETE soft : 204, détail 404, liste vide, double delete 404, deleted_at posé');
  } finally {
    // 10. Nettoyage HARD (client authentifié, scopé RLS) — ordre : summary (même soft-deleted),
    // document (embeddings CASCADE), jobs, notebooks.
    if (summaryId) await supabase.from('summaries').delete().eq('id', summaryId);
    if (documentId) await supabase.from('documents').delete().eq('id', documentId);
    for (const jobId of [docJobId, summaryJobId].filter(Boolean)) {
      await supabase.from('jobs').delete().eq('id', jobId);
    }
    await supabase.from('containers').delete().eq('id', notebookId);
    await supabase.from('containers').delete().eq('id', emptyNotebookId);
    console.log('✔ 10. Nettoyage (summary + document + jobs + notebooks ; objet S3 orphelin assumé)');
  }

  console.log('\n✅ e2e notebook-summaries : tout est conforme au contrat.\n');
}

main().catch((err) => {
  console.error(`\n❌ ÉCHEC e2e : ${err.message}\n`);
  process.exit(1);
});
