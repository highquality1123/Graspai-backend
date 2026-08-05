/**
 * Test end-to-end RÉEL du domaine Search (GET /search?q=).
 *
 * Comme les autres e2e : tape le VRAI serveur en HTTP et vérifie la conformité au contrat
 * openapi.yaml (forme SearchResult, status, {message,code}, zéro fuite de colonne interne).
 * Token frais récupéré ici (pas de token hardcodé).
 *
 * PRÉREQUIS
 *   - Le backend tourne : `yarn start:dev` (localhost:3100).
 *   - Migrations RLS appliquées (007 documents/containers + 009 notes) pour que le seed
 *     via le client authentifié passe. Un user de test confirmé.
 *
 * VARIABLES D'ENV REQUISES
 *   SUPABASE_URL · SUPABASE_ANON_KEY · TEST_USER_EMAIL · TEST_USER_PASSWORD
 *   E2E_BASE_URL (optionnel) défaut http://localhost:3100
 *
 * LANCER
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *     npx ts-node test/e2e/search.e2e.ts
 *
 * NOTES
 *   - Le domaine Notes V2 n'est pas sur cette branche -> la note et le document de test sont
 *     SEEDÉS directement via le client Supabase authentifié (RLS scopée au user), pas via l'API.
 *   - Nettoyage : suppression directe des lignes créées CE run (note, document, notebook).
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_ID = Date.now();
const TOKEN = `zzsrch${RUN_ID}`; // terme unique, minuscule, matchable en ILIKE

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

function assertErrorShape(res: ApiResponse, expectedCode: string): void {
  assert(res.body && typeof res.body === 'object', 'Erreur: body objet attendu');
  assert(typeof res.body.message === 'string', 'Erreur: message string attendu');
  assert(res.body.code === expectedCode, `Erreur: code "${expectedCode}" attendu, reçu "${res.body.code}"`);
}

/** Forme SearchResult + anti-fuite sur chaque hit. */
function assertSearchShape(body: any): void {
  assert(body && typeof body === 'object' && !Array.isArray(body), 'SearchResult: objet attendu');
  for (const k of ['notebooks', 'documents', 'notes'])
    assert(Array.isArray(body[k]), `SearchResult.${k} doit être un tableau`);
  for (const n of body.notebooks) {
    assert('id' in n && 'title' in n, 'notebook hit: {id,title} attendus');
    for (const bad of ['name', 'user_id', 'container_id', 'deleted_at'])
      assert(!(bad in n), `notebook hit: FUITE "${bad}"`);
  }
  for (const d of body.documents) {
    assert('id' in d && 'name' in d && 'notebookId' in d, 'document hit: {id,name,notebookId} attendus');
    for (const bad of ['container_id', 'user_id', 'length', 'pages_count'])
      assert(!(bad in d), `document hit: FUITE "${bad}"`);
  }
  for (const nt of body.notes) {
    assert('id' in nt && 'excerpt' in nt && 'notebookId' in nt, 'note hit: {id,excerpt,notebookId} attendus');
    for (const bad of ['content', 'title', 'container_id', 'user_id']) assert(!(bad in nt), `note hit: FUITE "${bad}"`);
  }
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

async function getSession(): Promise<{ token: string; userId: string; supabase: SupabaseClient }> {
  const supabase = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL as string,
    password: TEST_USER_PASSWORD as string,
  });
  if (error || !data.session) throw new Error(`Supabase sign-in échoué: ${error?.message ?? 'pas de session'}`);
  return { token: data.session.access_token, userId: data.user.id, supabase };
}

async function main(): Promise<void> {
  requireEnv();
  console.log(`\n🧪 E2E Search — cible ${BASE_URL} (terme: ${TOKEN})\n`);

  const { token, userId, supabase } = await getSession();
  console.log('🔑 Token Supabase frais acquis (user de test).\n');

  let notebookId: string | undefined;
  const noteId = randomUUID();
  const documentId = randomUUID();

  try {
    // 0. Setup : notebook (via API) + note & document (seedés en direct)
    await step('0. Setup notebook (API) + note & document (seed direct)', async () => {
      const nb = await api('POST', '/v1/notebooks', { token, body: { title: `${TOKEN} notebook` } });
      assertStatus(nb, 201);
      notebookId = nb.body.id;

      const seededNote = await supabase.from('notes').insert({
        id: noteId,
        user_id: userId,
        container_id: notebookId,
        title: `${TOKEN} note`,
        content: 'Excerpt body.',
      });
      assert(!seededNote.error, `seed note échoué: ${seededNote.error?.message}`);

      const seededDoc = await supabase
        .from('documents')
        .insert({ id: documentId, user_id: userId, container_id: notebookId, name: `${TOKEN}.pdf`, type: 'pdf' });
      assert(!seededDoc.error, `seed document échoué: ${seededDoc.error?.message}`);
    });

    // 1. Garde : sans token → 401
    await step('1. GET /v1/search sans token → 401 UNAUTHORIZED', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN}`);
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 2. q manquant → 400 BAD_REQUEST (pas 422)
    await step('2. GET /v1/search (sans q) → 400 BAD_REQUEST', async () => {
      const res = await api('GET', '/v1/search', { token });
      assert(res.status !== 422, 'ne doit pas renvoyer 422 (le contrat déclare 400)');
      assertStatus(res, 400);
      assertErrorShape(res, 'BAD_REQUEST');
    });

    // 3. Recherche du terme → notebook + document + note trouvés, formes conformes, zéro fuite
    await step('3. GET /v1/search?q=<terme> → notebook + document + note trouvés (formes + anti-fuite)', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN}`, { token });
      assertStatus(res, 200);
      assertSearchShape(res.body);
      assert(
        res.body.notebooks.some((n: any) => n.id === notebookId),
        'le notebook doit être trouvé',
      );
      assert(
        res.body.documents.some((d: any) => d.id === documentId && d.notebookId === notebookId),
        'le document doit être trouvé',
      );
      assert(
        res.body.notes.some((n: any) => n.id === noteId && n.notebookId === notebookId),
        'la note doit être trouvée',
      );
      const note = res.body.notes.find((n: any) => n.id === noteId);
      assert(note.excerpt === 'Excerpt body.', `excerpt attendu, reçu: ${note?.excerpt}`);
    });

    // 4. Terme sans correspondance → tout vide (formes respectées)
    await step('4. GET /v1/search?q=<inconnu> → { notebooks:[], documents:[], notes:[] }', async () => {
      const res = await api('GET', `/v1/search?q=nomatch${RUN_ID}zzz`, { token });
      assertStatus(res, 200);
      assertSearchShape(res.body);
      assert(
        res.body.notebooks.length === 0 && res.body.documents.length === 0 && res.body.notes.length === 0,
        'tout doit être vide',
      );
    });

    // 5. Métacaractères LIKE traités LITTÉRALEMENT (sinon `%` agirait en joker et tout remonterait)
    await step('5. GET /v1/search?q=% → le % est littéral, pas un joker', async () => {
      const pct = await api('POST', '/v1/notebooks', { token, body: { title: `${TOKEN} 100%pur` } });
      assertStatus(pct, 201);
      const pctId = pct.body.id;
      try {
        const res = await api('GET', `/v1/search?q=${encodeURIComponent('%')}`, { token });
        assertStatus(res, 200);
        const ids = res.body.notebooks.map((n: any) => n.id);
        assert(ids.includes(pctId), 'le notebook contenant un % littéral doit être trouvé');
        assert(!ids.includes(notebookId), 'ÉCHAPPEMENT CASSÉ : le % a agi comme joker (notebook sans % remonté)');
      } finally {
        await supabase
          .from('containers')
          .delete()
          .eq('id', pctId)
          .then(
            () => undefined,
            () => undefined,
          );
      }
    });

    // 6. Insensible à la casse (ILIKE)
    await step('6. GET /v1/search?q=<TERME EN MAJUSCULES> → trouve quand même', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN.toUpperCase()}`, { token });
      assertStatus(res, 200);
      assert(
        res.body.notebooks.some((n: any) => n.id === notebookId),
        'la recherche doit être insensible à la casse',
      );
    });

    // 7. Caractères spéciaux : ne doivent jamais casser la requête (sécurité PostgREST)
    await step('7. GET /v1/search?q=<quote, virgule, parenthèses> → 200, jamais 500', async () => {
      const res = await api('GET', `/v1/search?q=${encodeURIComponent("a'b,c(d)")}`, { token });
      assert(res.status !== 500, 'un terme avec caractères spéciaux ne doit JAMAIS casser le serveur');
      assertStatus(res, 200);
      assertSearchShape(res.body);
    });

    // 8. q composé uniquement d'espaces → 400
    await step('8. GET /v1/search?q=<espaces> → 400 BAD_REQUEST', async () => {
      const res = await api('GET', `/v1/search?q=${encodeURIComponent('   ')}`, { token });
      assertStatus(res, 400);
      assertErrorShape(res, 'BAD_REQUEST');
    });

    // 9. Token malformé (pas seulement « sans token ») → 401
    await step('9. GET /v1/search avec un token bidon → 401 UNAUTHORIZED', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN}`, { token: 'pas.un.jwt' });
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 10. Cascade : un notebook soft-deleted masque ses enfants (openapi.yaml:204)
    await step('10. DELETE du notebook → sa note ET son document sortent de la recherche', async () => {
      assertStatus(await api('DELETE', `/v1/notebooks/${notebookId}`, { token }), 204);

      const res = await api('GET', `/v1/search?q=${TOKEN}`, { token });
      assertStatus(res, 200);
      assert(!res.body.notebooks.some((n: any) => n.id === notebookId), 'le notebook soft-deleted ne doit plus sortir');
      assert(
        !res.body.notes.some((n: any) => n.id === noteId),
        'la note d’un notebook soft-deleted ne doit plus sortir',
      );
      assert(
        !res.body.documents.some((d: any) => d.id === documentId),
        'le document d’un notebook soft-deleted ne doit plus sortir',
      );
    });
  } finally {
    // Nettoyage HARD des lignes créées CE run.
    const del = (table: string, id: string) =>
      supabase
        .from(table)
        .delete()
        .eq('id', id)
        .then(
          () => undefined,
          () => undefined,
        );
    await del('notes', noteId);
    await del('documents', documentId);
    if (notebookId) await del('containers', notebookId);
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
