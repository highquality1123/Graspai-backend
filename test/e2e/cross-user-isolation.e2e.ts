/**
 * Test end-to-end RÉEL — ISOLATION ENTRE UTILISATEURS (sécurité).
 *
 * Le trou que les autres e2e ne couvrent pas : ils testent le scoping avec des UUID ALÉATOIRES
 * (ressource inexistante -> 404). Ici on teste le cas qui compte vraiment : un utilisateur B
 * tente d'accéder à des ressources EXISTANTES de l'utilisateur A. Un `.eq('user_id', …)` oublié
 * passerait tous les autres tests tout en FUITANT les données — pas celui-ci.
 *
 * Règle vérifiée partout : non-possédé => 404 (jamais 403, JAMAIS 200 avec la donnée d'autrui).
 *
 * PRÉREQUIS
 *   - Backend qui tourne (`yarn start:dev`, localhost:3100), migrations 006→011 appliquées.
 *   - Un utilisateur de test confirmé (= utilisateur A).
 *
 * VARIABLES D'ENV REQUISES
 *   SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
 *   SUPABASE_SERVICE_ROLE_SECRET  <- en plus des autres e2e : sert à créer/supprimer l'utilisateur B
 *   E2E_BASE_URL (optionnel, défaut http://localhost:3100)
 *
 * LANCER
 *   npx ts-node test/e2e/cross-user-isolation.e2e.ts
 *
 * NOTES
 *   - L'utilisateur B est JETABLE : créé via l'API admin au début, SUPPRIMÉ à la fin (finally).
 *   - Nettoyage : ressources de A + utilisateur B, tous supprimés en dur.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_SECRET, TEST_USER_EMAIL, TEST_USER_PASSWORD } =
  process.env;
const BASE_URL = process.env.E2E_BASE_URL ?? 'http://localhost:3100';
const RUN_ID = Date.now();
const TOKEN = `zziso${RUN_ID}`; // terme unique appartenant à A, que B ne doit JAMAIS voir

function requireEnv(): void {
  const missing = [
    'SUPABASE_URL',
    'SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_SECRET',
    'TEST_USER_EMAIL',
    'TEST_USER_PASSWORD',
  ].filter((k) => !process.env[k]);
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

/** Non-possédé : 404, jamais 403 (fuite d'existence), jamais 2xx (fuite de donnée). */
function assertDenied(res: ApiResponse, expected = 404): void {
  assert(res.status !== 403, `ne doit JAMAIS renvoyer 403 (fuite d'existence) — reçu 403`);
  assert(res.status < 200 || res.status >= 300, `FUITE : la ressource d'autrui a été servie (${res.status})`);
  assertStatus(res, expected);
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

async function signIn(
  email: string,
  password: string,
): Promise<{ token: string; userId: string; client: SupabaseClient }> {
  const client = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.session) throw new Error(`sign-in échoué (${email}): ${error?.message ?? 'pas de session'}`);
  return { token: data.session.access_token, userId: data.user.id, client };
}

async function main(): Promise<void> {
  requireEnv();
  console.log(`\n🧪 E2E Isolation utilisateurs — cible ${BASE_URL} (terme de A : ${TOKEN})\n`);

  const admin = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_SECRET as string, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const a = await signIn(TEST_USER_EMAIL as string, TEST_USER_PASSWORD as string);
  console.log('🔑 Utilisateur A connecté.');

  let bUserId: string | undefined;
  let bToken: string | undefined;
  let notebookId: string | undefined;
  let noteId: string | undefined;
  const documentId = crypto.randomUUID();

  try {
    // 0. A crée ses ressources
    await step('0. A crée un notebook + une note + un document (terme unique)', async () => {
      const nb = await api('POST', '/v1/notebooks', { token: a.token, body: { title: `${TOKEN} notebook de A` } });
      assertStatus(nb, 201);
      notebookId = nb.body.id;

      const note = await api('POST', `/v1/notebooks/${notebookId}/notes`, {
        token: a.token,
        body: { title: `${TOKEN} note de A`, body: 'Contenu privé de A.' },
      });
      assertStatus(note, 201);
      noteId = note.body.id;

      const doc = await a.client
        .from('documents')
        .insert({ id: documentId, user_id: a.userId, container_id: notebookId, name: `${TOKEN}.pdf`, type: 'pdf' });
      assert(!doc.error, `seed document échoué: ${doc.error?.message}`);
    });

    // 1. Création de l'utilisateur B (jetable)
    await step('1. Création de l’utilisateur B jetable (API admin)', async () => {
      const email = `e2e-iso-${RUN_ID}@example.com`;
      const password = `Iso-${RUN_ID}!aB`;
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      assert(!error && data.user, `création de B échouée: ${error?.message}`);
      bUserId = data.user.id;

      const b = await signIn(email, password);
      bToken = b.token;
      assert(b.userId === bUserId, 'l’id de B doit correspondre');
    });

    // 2. B ne voit PAS le notebook de A dans son arbre
    await step('2. B : GET /v1/notebooks → l’arbre de B ne contient PAS le notebook de A', async () => {
      const res = await api('GET', '/v1/notebooks', { token: bToken });
      assertStatus(res, 200);
      const inRoot = (res.body.rootNotebooks ?? []).some((n: any) => n.id === notebookId);
      const inFolders = (res.body.folders ?? []).some((f: any) =>
        (f.notebooks ?? []).some((n: any) => n.id === notebookId),
      );
      assert(!inRoot && !inFolders, 'FUITE : le notebook de A apparaît dans l’arbre de B');
    });

    // 3. B ne peut pas lister les notes du notebook de A
    await step('3. B : GET /v1/notebooks/<nb de A>/notes → 404 (pas 403, pas 200)', async () => {
      assertDenied(await api('GET', `/v1/notebooks/${notebookId}/notes`, { token: bToken }));
    });

    // 4. B ne peut pas lire la note de A
    await step('4. B : GET …/notes/<note de A> → 404', async () => {
      assertDenied(await api('GET', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token: bToken }));
    });

    // 5. B ne peut pas modifier la note de A
    await step('5. B : PATCH …/notes/<note de A> → 404', async () => {
      assertDenied(
        await api('PATCH', `/v1/notebooks/${notebookId}/notes/${noteId}`, {
          token: bToken,
          body: { title: 'pirraté par B' },
        }),
      );
    });

    // 6. B ne peut pas supprimer la note de A — ET la note doit survivre
    await step('6. B : DELETE …/notes/<note de A> → 404, et la note de A SURVIT', async () => {
      assertDenied(await api('DELETE', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token: bToken }));

      const stillThere = await api('GET', `/v1/notebooks/${notebookId}/notes/${noteId}`, { token: a.token });
      assertStatus(stillThere, 200);
      assert(stillThere.body.id === noteId, 'la note de A doit toujours exister après la tentative de B');
    });

    // 7. B ne peut pas rattacher une session d'étude au notebook de A (422 : pas de 404 au contrat)
    await step('7. B : POST /v1/study-sessions {notebookId de A} → 422 VALIDATION_FAILED', async () => {
      const res = await api('POST', '/v1/study-sessions', {
        token: bToken,
        body: { notebookId, durationSeconds: 60, completedAt: new Date(0).toISOString() },
      });
      assert(res.status !== 403, 'ne doit pas renvoyer 403');
      assert(res.status !== 201, 'FUITE : B a pu rattacher une session au notebook de A');
      assertStatus(res, 422);
    });

    // 8. La recherche de B ne remonte RIEN de A
    await step('8. B : GET /v1/search?q=<terme de A> → aucun résultat de A', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN}`, { token: bToken });
      assertStatus(res, 200);
      assert(res.body.notebooks.length === 0, 'FUITE : un notebook de A dans la recherche de B');
      assert(res.body.documents.length === 0, 'FUITE : un document de A dans la recherche de B');
      assert(res.body.notes.length === 0, 'FUITE : une note de A dans la recherche de B');
    });

    // 9. A retrouve bien ses propres données (contrôle négatif : le scoping n'a pas tout cassé)
    await step('9. Contrôle : A retrouve bien son notebook, sa note et son document', async () => {
      const res = await api('GET', `/v1/search?q=${TOKEN}`, { token: a.token });
      assertStatus(res, 200);
      assert(
        res.body.notebooks.some((n: any) => n.id === notebookId),
        'A doit voir son notebook',
      );
      assert(
        res.body.notes.some((n: any) => n.id === noteId),
        'A doit voir sa note',
      );
      assert(
        res.body.documents.some((d: any) => d.id === documentId),
        'A doit voir son document',
      );
    });
  } finally {
    // Nettoyage : ressources de A puis suppression de l'utilisateur B.
    const swallow = () => undefined;
    await a.client.from('documents').delete().eq('id', documentId).then(swallow, swallow);
    if (notebookId) await a.client.from('containers').delete().eq('id', notebookId).then(swallow, swallow);
    if (bUserId) {
      const { error } = await admin.auth.admin.deleteUser(bUserId);
      console.log(error ? `⚠️  suppression de B échouée: ${error.message}` : '🧹 utilisateur B supprimé.');
    }
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
