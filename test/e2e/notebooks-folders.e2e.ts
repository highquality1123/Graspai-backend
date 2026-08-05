/**
 * Test end-to-end RÉEL du domaine Notebooks + Folders.
 *
 * Contrairement aux specs unitaires (Supabase mocké), ce script tape le VRAI serveur en HTTP
 * et vérifie que chaque réponse est conforme au contrat openapi.yaml (formes, status, {message,code},
 * aucune fuite de colonne interne). Il récupère lui-même un token frais (pas de token hardcodé).
 *
 * PRÉREQUIS
 *   - Le backend tourne : `yarn start:dev` (localhost:3100), migrations 006 + 007 appliquées.
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
 *       npx ts-node test/e2e/notebooks-folders.e2e.ts
 *   PowerShell :
 *     $env:SUPABASE_URL="..."; $env:SUPABASE_ANON_KEY="..."; $env:TEST_USER_EMAIL="...";
 *     $env:TEST_USER_PASSWORD="..."; npx ts-node test/e2e/notebooks-folders.e2e.ts
 *
 * NOTES
 *   - Le Bearer token du user de test est IMPRIMÉ dans les logs (pour le réutiliser dans Swagger
 *     ou ailleurs). C'est un token éphémère de user de TEST, en local — à ne pas activer tel quel
 *     en CI (logs conservés).
 *   - Étape 11 : nettoyage HARD (vraie suppression de ligne, pas soft-delete) du notebook + folder
 *     créés UNIQUEMENT pendant ce run, via le client Supabase authentifié (PostgREST, scopé au user).
 *   - Exit code non-zéro si une assertion casse (intégrable en CI plus tard — DB de test joignable
 *     depuis le runner requise, sujet séparé, PAS branché ici).
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

const NOTEBOOK_FIELDS = ['id', 'title', 'folderId', 'pinned', 'visibility', 'createdAt', 'updatedAt'];
const NOTEBOOK_INTERNAL = ['schema_version', 'user_id', 'deleted_at', 'name', 'folder_id'];
const FOLDER_FIELDS = ['id', 'label', 'createdAt', 'updatedAt'];
const FOLDER_INTERNAL = ['user_id', 'deleted_at', 'name'];

function assertNotebookShape(nb: any): void {
  assert(nb && typeof nb === 'object', 'Notebook: objet attendu');
  for (const k of NOTEBOOK_FIELDS) assert(k in nb, `Notebook: champ contrat manquant "${k}"`);
  for (const k of NOTEBOOK_INTERNAL) assert(!(k in nb), `Notebook: FUITE de colonne interne "${k}"`);
  assert(typeof nb.pinned === 'boolean', 'Notebook.pinned doit être booléen');
  assert(['private', 'shared'].includes(nb.visibility), `Notebook.visibility invalide: ${nb.visibility}`);
}

function assertFolderShape(f: any): void {
  assert(f && typeof f === 'object', 'Folder: objet attendu');
  for (const k of FOLDER_FIELDS) assert(k in f, `Folder: champ contrat manquant "${k}"`);
  for (const k of FOLDER_INTERNAL) assert(!(k in f), `Folder: FUITE de colonne interne "${k}"`);
}

function assertErrorShape(res: ApiResponse, expectedCode: string): void {
  assert(res.body && typeof res.body === 'object', 'Erreur: body objet attendu');
  assert(typeof res.body.message === 'string', 'Erreur: message string attendu');
  assert(res.body.code === expectedCode, `Erreur: code "${expectedCode}" attendu, reçu "${res.body.code}"`);
}

/** Cherche un notebook (par id) dans l'arbre — retourne 'root' | 'folder' | null. */
function locateInTree(tree: any, notebookId: string): 'root' | 'folder' | null {
  if (tree?.rootNotebooks?.some((n: any) => n.id === notebookId)) return 'root';
  for (const f of tree?.folders ?? []) {
    if (f.notebooks?.some((n: any) => n.id === notebookId)) return 'folder';
  }
  return null;
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

/** Suppression HARD (row réellement retirée) via le client authentifié — scopée au user par RLS. */
async function hardDelete(supabase: SupabaseClient, table: string, id: string): Promise<void> {
  const { error } = await supabase.from(table).delete().eq('id', id);
  if (error) throw new Error(`hard delete ${table}/${id} échoué: ${error.message}`);
  const { data } = await supabase.from(table).select('id').eq('id', id).maybeSingle();
  assert(!data, `${table}/${id} devait être HARD-supprimé (row encore présente)`);
}

async function main(): Promise<void> {
  requireEnv();
  console.log(`\n🧪 E2E Notebooks + Folders — cible ${BASE_URL}\n`);

  const { token, supabase } = await getSession();
  console.log('🔑 Token Supabase frais acquis (user de test). Copie pour Swagger / autres tests :');
  console.log(`\n   Authorization: Bearer ${token}\n`);
  console.log(`   (token brut ci-dessous)\n   ${token}\n`);

  const title = `[e2e ${RUN_ID}] Notebook`;
  let createdNotebookId: string | undefined;
  let createdFolderId: string | undefined;

  try {
    // 1. Garde : sans token → 401
    await step('1. GET /v1/notebooks sans token → 401 UNAUTHORIZED', async () => {
      const res = await api('GET', '/v1/notebooks');
      assertStatus(res, 401);
      assertErrorShape(res, 'UNAUTHORIZED');
    });

    // 2. Création → 201 Notebook, aucune fuite interne
    await step('2. POST /v1/notebooks → 201 Notebook (forme + zéro fuite interne)', async () => {
      const res = await api('POST', '/v1/notebooks', { token, body: { title } });
      assertStatus(res, 201);
      assertNotebookShape(res.body);
      assert(res.body.title === title, 'title non conforme');
      assert(res.body.pinned === false, 'un nouveau notebook doit être non épinglé');
      assert(res.body.visibility === 'private', 'visibility par défaut doit être private');
      assert(res.body.folderId === null, 'un nouveau notebook doit être à la racine');
      createdNotebookId = res.body.id;
    });

    // 3. Arbre { folders[], rootNotebooks[] }, notebook présent
    await step('3. GET /v1/notebooks → arbre { folders[], rootNotebooks[] } + notebook présent', async () => {
      assert(createdNotebookId, 'prérequis: notebook non créé');
      const res = await api('GET', '/v1/notebooks', { token });
      assertStatus(res, 200);
      assert(!Array.isArray(res.body), "l'arbre doit être un objet, PAS un tableau plat");
      assert(Array.isArray(res.body.folders), 'tree.folders doit être un tableau');
      assert(Array.isArray(res.body.rootNotebooks), 'tree.rootNotebooks doit être un tableau');
      assert(locateInTree(res.body, createdNotebookId!) === 'root', 'le notebook créé doit être dans rootNotebooks');
    });

    // 4. PATCH titre
    await step('4. PATCH /v1/notebooks/:id (titre) → titre mis à jour', async () => {
      assert(createdNotebookId, 'prérequis: notebook non créé');
      const res = await api('PATCH', `/v1/notebooks/${createdNotebookId}`, {
        token,
        body: { title: `${title} (renamed)` },
      });
      assertStatus(res, 200);
      assertNotebookShape(res.body);
      assert(res.body.title === `${title} (renamed)`, 'titre non mis à jour');
    });

    // 5. PATCH pin (toggle)
    await step('5. PATCH /v1/notebooks/:id/pin → toggle pinned=true', async () => {
      assert(createdNotebookId, 'prérequis: notebook non créé');
      const res = await api('PATCH', `/v1/notebooks/${createdNotebookId}/pin`, { token });
      assertStatus(res, 200);
      assertNotebookShape(res.body);
      assert(res.body.pinned === true, 'pin devait passer à true');
    });

    // 6. Folder + move dedans
    await step('6. POST /v1/folders + PATCH move → notebook dans le folder', async () => {
      assert(createdNotebookId, 'prérequis: notebook non créé');
      const created = await api('POST', '/v1/folders', { token, body: { label: `[e2e ${RUN_ID}] Folder` } });
      assertStatus(created, 201);
      assertFolderShape(created.body);
      createdFolderId = created.body.id;

      const moved = await api('PATCH', `/v1/notebooks/${createdNotebookId}/move`, {
        token,
        body: { folderId: createdFolderId },
      });
      assertStatus(moved, 200);
      assertNotebookShape(moved.body);
      assert(moved.body.folderId === createdFolderId, 'folderId doit pointer sur le nouveau folder');
    });

    // 7. DELETE folder → DÉTACHEMENT (pas cascade)
    await step('7. DELETE /v1/folders/:id → notebook DÉTACHÉ (racine), PAS supprimé', async () => {
      assert(createdNotebookId && createdFolderId, 'prérequis: notebook/folder manquants');
      const del = await api('DELETE', `/v1/folders/${createdFolderId}`, { token });
      assertStatus(del, 204);

      const res = await api('GET', '/v1/notebooks', { token });
      assertStatus(res, 200);
      assert(
        !res.body.folders.some((f: any) => f.label?.includes(`[e2e ${RUN_ID}]`)),
        'le folder ne doit plus être dans l’arbre',
      );
      assert(
        locateInTree(res.body, createdNotebookId!) === 'root',
        'le notebook doit être revenu à la racine (détaché, pas supprimé)',
      );
    });

    // 8. Scoping : id inexistant → 404 NOT_FOUND (jamais 403)
    await step('8. PATCH /v1/notebooks/<uuid random> → 404 NOT_FOUND (pas 403)', async () => {
      const res = await api('PATCH', `/v1/notebooks/${randomUUID()}`, { token, body: { title: 'nope' } });
      assert(res.status !== 403, 'ne doit JAMAIS renvoyer 403 (fuite d’existence)');
      assertStatus(res, 404);
      assertErrorShape(res, 'NOT_FOUND');
    });

    // 9. Validation : champ inconnu → 422 + nom du champ fautif
    await step('9. POST /v1/notebooks {titel: ...} → 422 VALIDATION_FAILED (nomme le champ)', async () => {
      const res = await api('POST', '/v1/notebooks', { token, body: { title: `[e2e ${RUN_ID}] bad`, titel: 'typo' } });
      assertStatus(res, 422);
      assertErrorShape(res, 'VALIDATION_FAILED');
      assert(
        String(res.body.message).includes('titel'),
        `le message doit nommer le champ fautif "titel" (reçu: ${res.body.message})`,
      );
    });

    // 10. DELETE notebook → 204 puis absent de l'arbre (soft-delete)
    await step('10. DELETE /v1/notebooks/:id → 204 puis absent de l’arbre (soft-delete)', async () => {
      assert(createdNotebookId, 'prérequis: notebook non créé');
      const del = await api('DELETE', `/v1/notebooks/${createdNotebookId}`, { token });
      assertStatus(del, 204);

      const res = await api('GET', '/v1/notebooks', { token });
      assertStatus(res, 200);
      assert(locateInTree(res.body, createdNotebookId!) === null, 'le notebook soft-supprimé ne doit plus apparaître');
    });

    // 11. Nettoyage HARD : suppression réelle des lignes créées CE run (notebook + folder)
    await step('11. Nettoyage HARD du notebook + folder créés (rows réellement supprimées)', async () => {
      if (createdNotebookId) await hardDelete(supabase, 'containers', createdNotebookId);
      if (createdFolderId) await hardDelete(supabase, 'folders', createdFolderId);
      // Marque le nettoyage fait (le filet de secours ci-dessous n'aura rien à faire).
      createdNotebookId = undefined;
      createdFolderId = undefined;
    });
  } finally {
    // Filet de secours : si un step a cassé avant l'étape 11, on hard-supprime quand même ce run.
    if (createdFolderId)
      await supabase
        .from('folders')
        .delete()
        .eq('id', createdFolderId)
        .then(
          () => undefined,
          () => undefined,
        );
    if (createdNotebookId)
      await supabase
        .from('containers')
        .delete()
        .eq('id', createdNotebookId)
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
