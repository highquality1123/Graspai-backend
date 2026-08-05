/**
 * Test end-to-end RÉEL du domaine Notes (imbriqué sous un notebook).
 *
 * Comme notebooks-folders.e2e.ts : tape le VRAI serveur en HTTP et vérifie la conformité au
 * contrat openapi.yaml (formes, status, {message,code}, zéro fuite de colonne interne). Récupère
 * lui-même un token frais (pas de token hardcodé).
 *
 * PRÉREQUIS
 *   - Le backend tourne : `yarn start:dev` (localhost:3100), migrations 006 + 007 + 009 appliquées.
 *   - Un utilisateur de test existant et confirmé dans le projet Supabase de test.
 *
 * VARIABLES D'ENV REQUISES
 *   SUPABASE_URL         URL du projet Supabase de test
 *   SUPABASE_ANON_KEY    clé anon (publique) du même projet — sert à signInWithPassword
 *   TEST_USER_EMAIL      email d'un user de test confirmé
 *   TEST_USER_PASSWORD   son mot de passe
 *   E2E_BASE_URL         (optionnel) défaut http://localhost:3100
 *
 * LANCER
 *   bash / git-bash :
 *     SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *       npx ts-node test/e2e/notes.e2e.ts
 *   PowerShell :
 *     $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."; $env:TEST_USER_EMAIL="...";
 *     $env:TEST_USER_PASSWORD="..."; npx ts-node test/e2e/notes.e2e.ts
 *
 * NOTES
 *   - Le DELETE d'une note est un HARD delete (pas de soft-delete pour les notes en Phase 1,
 *     openapi.yaml:752-753). L'étape 9 vérifie donc qu'après DELETE la note renvoie 404.
 *   - Nettoyage : hard delete du notebook créé CE run (cascade FK -> supprime ses notes).
 *   - Exit code non-zéro si une assertion casse.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_ID = Date.now();

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

async function api(method: string, path: string, opts: { token?: string; body?: unknown } = {}): Promise<ApiResponse> {
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  const res = await fetch(`${BASE_URL}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
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

// ── Assertions ───────────────────────────────────────────────────────────────
function assert(cond: unknown, msg: string): asserts cond {
  if (!cond) throw new Error(msg);
}

function assertStatus(res: ApiResponse, expected: number): void {
  assert(res.status === expected, `HTTP ${expected} attendu, reçu ${res.status} (body: ${res.raw?.slice(0, 200)})`);
}

const NOTE_FIELDS = ['id', 'notebookId', 'title', 'body', 'sourceDocumentId', 'createdAt', 'updatedAt'];
const NOTE_INTERNAL = ['user_id', 'container_id', 'content', 'document_id', 'deleted_at', 'created_at', 'updated_at'];

function assertNoteShape(n: any): void {
  assert(n && typeof n === 'object', 'Note: objet attendu');
  for (const k of NOTE_FIELDS) assert(k in n, `Note: champ contrat manquant "${k}"`);
  for (const k of NOTE_INTERNAL) assert(!(k in n), `Note: FUITE de colonne interne "${k}"`);
}

function assertErrorShape(res: ApiResponse, expectedCode: string): void {
  assert(res.body && typeof res.body === 'object', 'Erreur: body objet attendu');
  assert(typeof res.body.message === 'string', 'Erreur: message string attendu');
  assert(res.body.code === expectedCode, `Erreur: code "${expectedCode}" attendu, reçu "${res.body.code}"`);
}

// ── Runner ───────────────────────────────────────────────────────────────────
let passed = 0;
let failed = 0;

async function step(desc: string, fn: () => Promise<void>): Promise<void> {
  try {
    await fn();
    passed++;
    console.log(`✅ ${desc}`);
  } catch (e) {
    failed++;
    console.log(`❌ ${desc}\n     → ${(e as Error).message}`);
  }
}

async function getSession(): Promise<{ token: string; supabase: SupabaseClient }> {
  const supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL as string,
    password: TEST_USER_PASSWORD as string,
  });
  if (error || !data.session) throw new Error(`Supabase sign-in échoué: ${error?.message ?? 'pas de session'}`);
  return { token: data.session.access_token, supabase };
}

async function main(): Promise<void> {
  requireEnv();
  console.log(`\n🧪 E2E Notes — cible ${BASE_URL}\n`);

  const { token, supabase } = await getSession();
  console.log('🔑 Token Supabase frais acquis (user de test).\n');

  let notebookId: string | undefined;
  let noteId: string | undefined;
  let sourceDocId: string | undefined;
  const title = `[e2e ${RUN_ID}] Note`;

  try {
    // 0. Setup : créer un notebook parent
    await step('0. POST /v1/notebooks → 201 (notebook parent des notes)', async () => {
      const res = await api('POST', '/v1/notebooks', { token, body: { title: `[e2e ${RUN_ID}] Notebook` } });
      assertStatus(res, 201);
      notebookId = res.body.id;
      assert(!!notebookId, 'notebookId manquant');
    });

    // 1. Garde : sans token → 401
    await step('1. GET /v1/notebooks/:id/notes sans token → 401 UNAUTHORIZED', async () => {
      const res = await api('GET', `/v1/notebooks/${notebookId}/notes`);
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 2. Création → 201 Note, forme + zéro fuite ; sourceDocumentId null (aucune source fournie)
    await step('2. POST …/notes → 201 Note (forme + zéro fuite, sourceDocumentId null)', async () => {
      const res = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title, body: 'Contenu markdown de la note.' },
      });
      assertStatus(res, 201);
      assertNoteShape(res.body);
      assert(res.body.title === title, 'title non conforme');
      assert(res.body.body === 'Contenu markdown de la note.', 'body non conforme');
      assert(res.body.notebookId === notebookId, 'notebookId doit pointer sur le notebook parent');
      assert(res.body.sourceDocumentId === null, 'sourceDocumentId doit être null sans source');
      noteId = res.body.id;
    });

    // 3. Liste → tableau nu contenant la note
    await step('3. GET …/notes → tableau nu + note présente', async () => {
      const res = await api('GET', `/v1/notebooks/${notebookId}/notes`, { token });
      assertStatus(res, 200);
      assert(Array.isArray(res.body), 'la liste des notes doit être un tableau nu');
      const found = res.body.find((n: any) => n.id === noteId);
      assert(!!found, 'la note créée doit être dans la liste');
      assertNoteShape(found);
    });

    // 4. Détail → 200 Note
    await step('4. GET …/notes/:noteId → 200 Note', async () => {
      const res = await api('GET', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token });
      assertStatus(res, 200);
      assertNoteShape(res.body);
      assert(res.body.id === noteId, 'id non conforme');
    });

    // 5. PATCH body → 200, body mis à jour
    await step('5. PATCH …/notes/:noteId (body) → body mis à jour', async () => {
      const res = await api('PATCH', `/v1/notebooks/${notebookId}/notes/${noteId}`, {
        token,
        body: { body: 'Contenu révisé.' },
      });
      assertStatus(res, 200);
      assertNoteShape(res.body);
      assert(res.body.body === 'Contenu révisé.', 'body non mis à jour');
    });

    // 6. Scoping note : id inexistant → 404 NOT_FOUND (jamais 403)
    await step('6. PATCH …/notes/<uuid random> → 404 NOT_FOUND (pas 403)', async () => {
      const res = await api('PATCH', `/v1/notebooks/${notebookId}/notes/${randomUUID()}`, {
        token,
        body: { title: 'nope' },
      });
      assert(res.status !== 403, 'ne doit JAMAIS renvoyer 403 (fuite d’existence)');
      assertStatus(res, 404);
      assertErrorShape(res, 'NOT_FOUND');
    });

    // 7. Scoping notebook parent : notebook inexistant → 404
    await step('7. GET /v1/notebooks/<uuid random>/notes → 404 NOT_FOUND (notebook non possédé)', async () => {
      const res = await api('GET', `/v1/notebooks/${randomUUID()}/notes`, { token });
      assert(res.status !== 403, 'ne doit JAMAIS renvoyer 403');
      assertStatus(res, 404);
      assertErrorShape(res, 'NOT_FOUND');
    });

    // 8. Validation : champ inconnu → 422 + nom du champ fautif
    await step('8. POST …/notes {bogus:…} → 422 VALIDATION_FAILED (nomme le champ)', async () => {
      const res = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] bad`, body: 'x', bogus: 'typo' },
      });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
      assert(String(res.body.message).includes('bogus'), `le message doit nommer "bogus" (reçu: ${res.body.message})`);
    });

    // 9. DELETE note → 204 puis 404 (HARD delete : la note n'existe plus)
    await step('9. DELETE …/notes/:noteId → 204 puis GET → 404 (hard delete)', async () => {
      const del = await api('DELETE', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token });
      assertStatus(del, 204);

      const res = await api('GET', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token });
      assertStatus(res, 404);
      assertErrorShape(res, 'NOT_FOUND');
      noteId = undefined; // supprimée pour de vrai
    });

    // 10. sourceDocumentId inexistant/étranger → 404 propre, JAMAIS un 500 de violation FK
    await step('10. POST …/notes {sourceDocumentId: <uuid random>} → 404 NOT_FOUND (pas de 500 FK)', async () => {
      const res = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] src-ghost`, body: 'x', sourceDocumentId: randomUUID() },
      });
      assert(res.status !== 500, 'un uuid source inexistant ne doit JAMAIS produire un 500 (violation FK)');
      assertStatus(res, 404);
      assertErrorShape(res, 'NOT_FOUND');
    });

    // 11. sourceDocumentId RÉEL → 201, persisté et renvoyé (le bug legacy corrigé, de bout en bout)
    await step('11. POST …/notes avec un vrai sourceDocumentId → 201, persisté et renvoyé', async () => {
      // Ligne `documents` insérée directement via PostgREST (policy documents_owner) — pas
      // besoin du pipeline d'ingestion pour tester la référence.
      const { data: userData } = await supabase.auth.getUser();
      sourceDocId = randomUUID();
      const { error: docError } = await supabase.from('documents').insert({
        id: sourceDocId,
        user_id: userData.user?.id,
        container_id: notebookId,
        name: `[e2e ${RUN_ID}] source.pdf`,
        type: 'pdf',
        language: 'en',
      });
      assert(!docError, `Insertion du document source impossible : ${docError?.message}`);

      const res = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] sourced`, body: 'Note liée.', sourceDocumentId: sourceDocId },
      });
      assertStatus(res, 201);
      assertNoteShape(res.body);
      assert(res.body.sourceDocumentId === sourceDocId, 'sourceDocumentId doit être persisté et renvoyé');
    });

    // 12. Bornes du titre (contrat : minLength 1, maxLength 300)
    await step('12. titre de 300 caractères → 201 ; 301 → 422', async () => {
      const ok = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: 'a'.repeat(300), body: 'x' },
      });
      assertStatus(ok, 201);

      const tooLong = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: 'a'.repeat(301), body: 'x' },
      });
      assertStatus(tooLong, 422);
      assertErrorShape(tooLong, 'VALIDATION_FAILED');
    });

    // 13. PATCH vide → 422 (le contrat impose minProperties: 1)
    await step('13. PATCH …/notes/:id avec {} → 422 VALIDATION_FAILED', async () => {
      const created = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] patch-vide`, body: 'initial' },
      });
      assertStatus(created, 201);

      const res = await api('PATCH', `/v1/notebooks/${notebookId}/notes/${created.body.id}`, { token, body: {} });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 14. PATCH partiel : le champ absent ne doit PAS être écrasé
    await step('14. PATCH {title} seul → titre changé, body INCHANGÉ', async () => {
      const created = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] partiel`, body: 'body-original' },
      });
      assertStatus(created, 201);

      const res = await api('PATCH', `/v1/notebooks/${notebookId}/notes/${created.body.id}`, {
        token,
        body: { title: 'titre-modifie' },
      });
      assertStatus(res, 200);
      assert(res.body.title === 'titre-modifie', 'le titre doit être modifié');
      assert(res.body.body === 'body-original', 'le body NE doit PAS être écrasé par un PATCH partiel');
    });

    // 15. Tri de la liste : updatedAt décroissant (vérifie aussi le trigger updated_at, migration 009)
    await step('15. GET …/notes → trié par updatedAt décroissant', async () => {
      const first = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] tri-1`, body: 'x' },
      });
      assertStatus(first, 201);
      const second = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] tri-2`, body: 'x' },
      });
      assertStatus(second, 201);

      // On « remonte » la première en la modifiant : elle doit repasser devant la seconde.
      assertStatus(
        await api('PATCH', `/v1/notebooks/${notebookId}/notes/${first.body.id}`, { token, body: { body: 'touchée' } }),
        200,
      );

      const list = await api('GET', `/v1/notebooks/${notebookId}/notes`, { token });
      assertStatus(list, 200);
      const idx1 = list.body.findIndex((n: any) => n.id === first.body.id);
      const idx2 = list.body.findIndex((n: any) => n.id === second.body.id);
      assert(idx1 >= 0 && idx2 >= 0, 'les deux notes doivent être listées');
      assert(idx1 < idx2, 'la note modifiée en dernier doit apparaître AVANT (tri updatedAt desc)');
    });

    // 16. Token malformé (pas seulement « sans token ») → 401
    await step('16. GET …/notes avec un token bidon → 401 UNAUTHORIZED', async () => {
      const res = await api('GET', `/v1/notebooks/${notebookId}/notes`, { token: 'pas.un.jwt' });
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 17. Cascade : un notebook soft-deleted ne sert plus ses notes (openapi.yaml:204)
    await step('17. DELETE du notebook → ses notes ne sont plus servies (404)', async () => {
      const created = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token,
        body: { title: `[e2e ${RUN_ID}] orpheline`, body: 'x' },
      });
      assertStatus(created, 201);

      assertStatus(await api('DELETE', `/v1/notebooks/${notebookId}`, { token }), 204);

      assertStatus(await api('GET', `/v1/notebooks/${notebookId}/notes`, { token }), 404);
      assertStatus(await api('GET', `/v1/notebooks/${notebookId}/notes/${created.body.id}`, { token }), 404);
    });
  } finally {
    // Nettoyage HARD : le document source d'abord (sa FK vers containers n'a PAS de cascade —
    // un doc résiduel ferait échouer la suppression du notebook ; sa propre cascade emporte la
    // note liée), puis le notebook (cascade FK -> supprime ses notes restantes).
    if (sourceDocId)
      await supabase
        .from('documents')
        .delete()
        .eq('id', sourceDocId)
        .then(
          () => undefined,
          () => undefined,
        );
    if (notebookId)
      await supabase
        .from('containers')
        .delete()
        .eq('id', notebookId)
        .then(
          () => undefined,
          () => undefined,
        );
  }

  console.log(`\n────────────────────────────────────────`);
  console.log(`Résultat : ${passed} ✅  /  ${failed} ❌  (${passed + failed} étapes)`);
  console.log(`────────────────────────────────────────\n`);
  process.exitCode = failed > 0 ? 1 : 0;
}

main().catch((e) => {
  console.error(`\n💥 Échec fatal (avant/hors scénario) : ${(e as Error).message}`);
  process.exit(1);
});
