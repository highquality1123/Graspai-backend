/**
 * Test end-to-end RÉEL du domaine Study Sessions (POST /study-sessions).
 *
 * Comme notebooks-folders.e2e.ts : tape le VRAI serveur en HTTP et vérifie la conformité au
 * contrat openapi.yaml (forme StudySession, status, {message,code}, zéro fuite de colonne interne).
 * Récupère lui-même un token frais (pas de token hardcodé).
 *
 * PRÉREQUIS
 *   - Le backend tourne : `yarn start:dev` (localhost:3100), migration 010 appliquée.
 *   - Un utilisateur de test existant et confirmé dans le projet Supabase de test.
 *
 * VARIABLES D'ENV REQUISES
 *   SUPABASE_URL · SUPABASE_ANON_KEY · TEST_USER_EMAIL · TEST_USER_PASSWORD
 *   E2E_BASE_URL (optionnel) défaut http://localhost:3100
 *
 * LANCER
 *   SUPABASE_URL=... SUPABASE_ANON_KEY=... TEST_USER_EMAIL=... TEST_USER_PASSWORD=... \
 *     npx ts-node test/e2e/study-sessions.e2e.ts
 *
 * NOTES
 *   - Pas d'endpoint DELETE pour les sessions -> nettoyage direct via le client Supabase
 *     authentifié (RLS scopée au user) : les sessions créées CE run + le notebook parent.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { randomUUID } from 'crypto';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD } = process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';

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

const SESSION_FIELDS = ['id', 'notebookId', 'durationSeconds', 'completedAt', 'createdAt'];
const SESSION_INTERNAL = ['user_id', 'notebook_id', 'duration_seconds', 'completed_at', 'created_at'];

function assertSessionShape(s: any): void {
  assert(s && typeof s === 'object', 'StudySession: objet attendu');
  for (const k of SESSION_FIELDS) assert(k in s, `StudySession: champ contrat manquant "${k}"`);
  for (const k of SESSION_INTERNAL) assert(!(k in s), `StudySession: FUITE de colonne interne "${k}"`);
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
  console.log(`\n🧪 E2E Study Sessions — cible ${BASE_URL}\n`);

  const { token, supabase } = await getSession();
  console.log('🔑 Token Supabase frais acquis (user de test).\n');

  const completedAt = new Date(0).toISOString(); // horodatage fixe déterministe
  let notebookId: string | undefined;
  const createdSessionIds: string[] = [];

  try {
    // 0. Setup : notebook parent (pour le cas notebookId non-null)
    await step('0. POST /v1/notebooks → 201 (notebook parent)', async () => {
      const res = await api('POST', '/v1/notebooks', { token, body: { title: '[e2e study] Notebook' } });
      assertStatus(res, 201);
      notebookId = res.body.id;
      assert(!!notebookId, 'notebookId manquant');
    });

    // 1. Garde : sans token → 401
    await step('1. POST /v1/study-sessions sans token → 401 UNAUTHORIZED', async () => {
      const res = await api('POST', '/v1/study-sessions', { body: { durationSeconds: 60, completedAt } });
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 2. Création avec notebookId → 201 StudySession (forme + zéro fuite)
    await step('2. POST …/study-sessions {notebookId} → 201 StudySession (forme + zéro fuite)', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { notebookId, durationSeconds: 1500, completedAt },
      });
      assertStatus(res, 201);
      assertSessionShape(res.body);
      assert(res.body.notebookId === notebookId, 'notebookId non conforme');
      assert(res.body.durationSeconds === 1500, 'durationSeconds non conforme');
      createdSessionIds.push(res.body.id);
    });

    // 3. Création sans notebookId → 201, notebookId null (session hors notebook)
    await step('3. POST …/study-sessions sans notebookId → 201, notebookId null', async () => {
      const res = await api('POST', '/v1/study-sessions', { token, body: { durationSeconds: 60, completedAt } });
      assertStatus(res, 201);
      assertSessionShape(res.body);
      assert(res.body.notebookId === null, 'notebookId doit être null sans notebook');
      createdSessionIds.push(res.body.id);
    });

    // 4. Validation : champ requis manquant → 422
    await step('4. POST …/study-sessions {sans durationSeconds} → 422 VALIDATION_FAILED', async () => {
      const res = await api('POST', '/v1/study-sessions', { token, body: { completedAt } });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 4b. Validation : durée > 24h (86400s) → 422 (borne haute)
    await step('4b. POST …/study-sessions {durationSeconds > 86400} → 422', async () => {
      const res = await api('POST', '/v1/study-sessions', { token, body: { durationSeconds: 86401, completedAt } });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 5. Validation : champ inconnu → 422 + nom du champ fautif
    await step('5. POST …/study-sessions {bogus} → 422 (nomme le champ)', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { durationSeconds: 60, completedAt, bogus: 'typo' },
      });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
      assert(String(res.body.message).includes('bogus'), `le message doit nommer "bogus" (reçu: ${res.body.message})`);
    });

    // 6. Notebook invalide/non-possédé → 422 (le contrat POST /study-sessions n'a PAS de 404)
    await step('6. POST …/study-sessions {notebookId random} → 422 VALIDATION_FAILED', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { notebookId: randomUUID(), durationSeconds: 60, completedAt },
      });
      assert(res.status !== 403, 'ne doit JAMAIS renvoyer 403');
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 7. Bornes ACCEPTÉES : 1s (minimum contrat) et 86400s (= 24h, maximum exact)
    await step('7. durationSeconds = 1 et = 86400 (bornes incluses) → 201', async () => {
      for (const seconds of [1, 86400]) {
        const res = await api('POST', '/v1/study-sessions', { token, body: { durationSeconds: seconds, completedAt } });
        assertStatus(res, 201);
        assert(res.body.durationSeconds === seconds, `durationSeconds ${seconds} non conservé`);
        createdSessionIds.push(res.body.id);
      }
    });

    // 8. Bornes REJETÉES : 0 (sous le minimum) et 86401 (juste au-dessus du maximum)
    await step('8. durationSeconds = 0 et = 86401 (hors bornes) → 422', async () => {
      for (const seconds of [0, 86401]) {
        const res = await api('POST', '/v1/study-sessions', { token, body: { durationSeconds: seconds, completedAt } });
        assertStatus(res, 422);
        assertErrorShape(res, 'VALIDATION_FAILED');
      }
    });

    // 9. Type : le contrat impose un entier
    await step('9. durationSeconds non entier (1.5) → 422', async () => {
      const res = await api('POST', '/v1/study-sessions', { token, body: { durationSeconds: 1.5, completedAt } });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 10. Format : completedAt doit être une date-time ISO
    await step('10. completedAt malformé → 422', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { durationSeconds: 60, completedAt: 'pas-une-date' },
      });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
    });

    // 11. notebookId explicitement null (le contrat le déclare nullable) → accepté
    await step('11. notebookId: null explicite → 201, notebookId null', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { notebookId: null, durationSeconds: 60, completedAt },
      });
      assertStatus(res, 201);
      assert(res.body.notebookId === null, 'notebookId doit rester null');
      createdSessionIds.push(res.body.id);
    });

    // 12. Cascade : un notebook soft-deleted n'est plus rattachable (comme un notebook d'autrui)
    await step('12. notebookId d’un notebook SOFT-DELETED → 422', async () => {
      const nb = await api('POST', '/v1/notebooks', { token, body: { title: '[e2e study] à supprimer' } });
      assertStatus(nb, 201);
      const deadId = nb.body.id;
      assertStatus(await api('DELETE', `/v1/notebooks/${deadId}`, { token }), 204);

      const res = await api('POST', '/v1/study-sessions', {
        token,
        body: { notebookId: deadId, durationSeconds: 60, completedAt },
      });
      assert(res.status !== 201, 'FUITE : session rattachée à un notebook supprimé');
      assertStatus(res, 422);

      await supabase
        .from('containers')
        .delete()
        .eq('id', deadId)
        .then(
          () => undefined,
          () => undefined,
        );
    });

    // 13. Token malformé (pas seulement « sans token ») → 401
    await step('13. POST /v1/study-sessions avec un token bidon → 401 UNAUTHORIZED', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token: 'pas.un.jwt',
        body: { durationSeconds: 60, completedAt },
      });
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });
  } finally {
    // Nettoyage HARD : sessions créées CE run + notebook parent (client authentifié, RLS scopée).
    for (const id of createdSessionIds) {
      await supabase
        .from('study_sessions')
        .delete()
        .eq('id', id)
        .then(
          () => undefined,
          () => undefined,
        );
    }
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
