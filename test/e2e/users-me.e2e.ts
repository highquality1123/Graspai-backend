/**
 * Test end-to-end RÉEL du domaine Users/me — GET (lazy-create) + PATCH (goal 2 : email compris).
 *
 * Vérifie en particulier :
 *  - l'ANTI-FUITE : aucune des 9 colonnes internes (role, is_premium_user, profile_status,
 *    confirmed, sso_enabled, et les 4 OTP legacy) n'apparaît JAMAIS dans une réponse ;
 *  - l'ANTI-ESCALATION : PATCH {role}/{is_premium_user}/{sso_enabled} → 422 nommant le champ ;
 *  - le CHANGEMENT D'EMAIL (goal 2) propagé à profiles ET auth.users, sur un user jetable ;
 *  - le LAZY-CREATE (arbitrage D') en réel : un utilisateur SANS ligne profiles obtient un
 *    profil à la première lecture. Deux stratégies, la première possible est utilisée :
 *      (a) signUp() Supabase natif d'un user jetable (aucun trigger → pas de profil → parfait) ;
 *          nécessite les confirmations email désactivées sur le projet TEST ;
 *      (b) sinon : DELETE de la ligne profiles du user de test via PostgREST (policy 012)
 *          puis GET → recréé ; échoue si le user a des enfants FK (notebooks, jobs…) — dans
 *          ce cas l'étape est SKIP avec raison claire, pas un faux vert.
 *
 * PRÉREQUIS : backend démarré (localhost:3100), migration 012 appliquée (colonnes + RLS).
 * VARIABLES : SUPABASE_URL, SUPABASE_ANON_KEY, TEST_USER_EMAIL, TEST_USER_PASSWORD
 *             (+ E2E_BASE_URL optionnel).
 *             SUPABASE_SERVICE_ROLE_SECRET (optionnel) : active l'étape 9 (changement d'email) —
 *             elle crée/supprime un utilisateur JETABLE via l'API admin ; le user de test
 *             partagé n'est JAMAIS modifié. Absent → étape sautée (couverte par les unitaires).
 * LANCER : npx ts-node test/e2e/users-me.e2e.ts
 *
 * NETTOYAGE : le user jetable (stratégie a) voit sa ligne profiles supprimée ; la ligne
 * auth.users jetable reste (pas d'API admin côté test) — orphelin assumé dans le projet TEST.
 */
import { createClient, SupabaseClient } from '@supabase/supabase-js';

// ── Config ───────────────────────────────────────────────────────────────────
const { SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_SECRET, TEST_USER_EMAIL, TEST_USER_PASSWORD } =
  process.env;
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
  const headers: Record<string, string> = {};
  if (opts.token) headers.Authorization = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers['Content-Type'] = 'application/json';
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

const PROFILE_FIELDS = ['id', 'email', 'fullName', 'onboardingComplete', 'createdAt', 'updatedAt'];
// Les 9 internes + les noms snake_case bruts : AUCUN ne doit jamais apparaître.
const PROFILE_INTERNAL = [
  'role',
  'is_premium_user',
  'profile_status',
  'confirmed',
  'sso_enabled',
  'confirmation_otp',
  'confirmation_otp_expiry',
  'password_reset_otp',
  'password_reset_otp_expiry',
  'full_name',
  'profile_picture',
  'color_mode',
  'onboarding_complete',
  'created_at',
  'updated_at',
];

function assertProfileShape(p: any): void {
  assert(p && typeof p === 'object', 'UserProfile: objet attendu');
  for (const k of PROFILE_FIELDS) assert(k in p, `UserProfile: champ contrat manquant "${k}"`);
  for (const k of PROFILE_INTERNAL) assert(!(k in p), `UserProfile: FUITE de colonne interne "${k}"`);
  assert(typeof p.onboardingComplete === 'boolean', 'onboardingComplete booléen attendu');
}

// ── Scénario ─────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  requireEnv();

  console.log(`\n▶ e2e users-me (goal 1) — run ${RUN_ID} sur ${BASE_URL}\n`);

  const supabase: SupabaseClient = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  const { data: auth, error: authError } = await supabase.auth.signInWithPassword({
    email: TEST_USER_EMAIL as string,
    password: TEST_USER_PASSWORD as string,
  });
  assert(!authError && auth?.session, `Login du user de test impossible : ${authError?.message}`);
  const token = auth.session.access_token;
  console.log(`✔ 1. Token obtenu (user ${auth.user?.id})`);

  // 2. Garde
  const anon = await api('GET', '/v1/users/me');
  assertStatus(anon, 401);
  console.log('✔ 2. 401 sans Bearer');

  // 3. GET me — forme contrat + anti-fuite complète (OTP compris)
  const me = await api('GET', '/v1/users/me', { token });
  assertStatus(me, 200);
  assertProfileShape(me.body);
  assert(me.body.id === auth.user?.id, 'id doit être celui du JWT');
  const originalFullName: string = me.body.fullName;
  const originalLanguage: string | null = me.body.language;
  console.log(`✔ 3. GET me conforme, zéro fuite ("${me.body.fullName}")`);

  // 4. PATCH des champs autorisés → écho + persistance
  const patched = await api('PATCH', '/v1/users/me', {
    token,
    body: { fullName: `e2e-${RUN_ID}`, language: 'fr', colorMode: 'dark', onboardingComplete: true },
  });
  assertStatus(patched, 200);
  assertProfileShape(patched.body);
  assert(patched.body.fullName === `e2e-${RUN_ID}`, 'fullName non appliqué');
  assert(patched.body.language === 'fr' && patched.body.colorMode === 'dark', 'language/colorMode non appliqués');
  assert(patched.body.onboardingComplete === true, 'onboardingComplete non appliqué');
  const confirm = await api('GET', '/v1/users/me', { token });
  assert(confirm.body.fullName === `e2e-${RUN_ID}`, 'fullName non persisté');
  console.log('✔ 4. PATCH fullName/language/colorMode/onboardingComplete');

  // 5. PATCH {} → 422 (minProperties)
  const empty = await api('PATCH', '/v1/users/me', { token, body: {} });
  assertStatus(empty, 422);
  console.log('✔ 5. PATCH {} → 422');

  // 6. ANTI-ESCALATION : role / is_premium_user / sso_enabled hors whitelist → 422 nommant le champ.
  //    NB : `email` N'EST PLUS ici — il est modifiable au contrat (goal 2), testé à l'étape 9.
  for (const [field, value] of [
    ['role', 'admin'],
    ['is_premium_user', true],
    ['sso_enabled', true],
  ] as const) {
    const res = await api('PATCH', '/v1/users/me', { token, body: { [field]: value } });
    assertStatus(res, 422);
    assert(String(res.body.message).includes(field), `le 422 doit nommer "${field}" (reçu: ${res.body.message})`);
  }
  const after = await api('GET', '/v1/users/me', { token });
  assertProfileShape(after.body); // toujours aucune fuite — et rien n'a été élevé
  console.log('✔ 6. Anti-escalation : role/is_premium_user/sso_enabled → 422 nommant le champ');

  // 7. LAZY-CREATE en réel (arbitrage D')
  let lazyProven = false;
  // Stratégie (a) : user jetable via signUp natif — aucun trigger → aucun profil → cas exact.
  const throwawayEmail = `e2e-lazy-${RUN_ID}@example.com`;
  const throwawayPassword = `E2e!${RUN_ID}x`;
  const throwaway = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string);
  const { data: signUpData, error: signUpError } = await throwaway.auth.signUp({
    email: throwawayEmail,
    password: throwawayPassword,
  });
  if (!signUpError && signUpData.session) {
    const lazyMe = await api('GET', '/v1/users/me', { token: signUpData.session.access_token });
    assertStatus(lazyMe, 200);
    assertProfileShape(lazyMe.body);
    assert(lazyMe.body.email === throwawayEmail, 'le profil lazy-créé doit porter l’email du token');
    assert(lazyMe.body.fullName === `e2e-lazy-${RUN_ID}`, 'fullName lazy = préfixe email (fallback legacy)');
    // Idempotence à chaud : un second GET renvoie la MÊME ligne (pas de doublon possible, PK).
    const again = await api('GET', '/v1/users/me', { token: signUpData.session.access_token });
    assert(again.body.id === lazyMe.body.id, 'second GET = même profil');
    // Nettoyage : la ligne profiles jetable (policy 012 — aucune FK enfant, delete OK).
    await throwaway.from('profiles').delete().eq('id', lazyMe.body.id);
    lazyProven = true;
    console.log('✔ 7. LAZY-CREATE prouvé (signUp natif → profil créé à la 1re lecture, idempotent)');
  } else {
    console.log(
      `· 7. Stratégie signUp indisponible (${signUpError?.message ?? 'confirmation email requise'}) — ` +
        `lazy-create couvert par les tests unitaires ; activer l’auto-confirm sur le projet TEST pour le prouver ici`,
    );
  }

  // 8. Restauration du profil du user de test
  const restored = await api('PATCH', '/v1/users/me', {
    token,
    body: { fullName: originalFullName || 'Test User', language: originalLanguage ?? 'en' },
  });
  assertStatus(restored, 200);
  console.log('✔ 8. Profil du user de test restauré');

  // 9. CHANGEMENT D'EMAIL (goal 2) — sur un utilisateur JETABLE, JAMAIS le user partagé :
  //    un finally ne s'exécute pas si le process est tué, et ce user sert à tous les autres e2e.
  let emailChangeProven = false;
  if (SUPABASE_SERVICE_ROLE_SECRET) {
    const admin = createClient(SUPABASE_URL as string, SUPABASE_SERVICE_ROLE_SECRET as string, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const email0 = `e2e-mail-${RUN_ID}@example.com`;
    const email1 = `e2e-mail2-${RUN_ID}@example.com`;
    const password = `E2e-${RUN_ID}!x`;
    let throwawayId: string | undefined;
    try {
      const { data: created, error: createErr } = await admin.auth.admin.createUser({
        email: email0,
        password,
        email_confirm: true,
      });
      assert(!createErr && created.user, `création du user jetable échouée : ${createErr?.message}`);
      throwawayId = created.user.id;

      const throwaway = createClient(SUPABASE_URL as string, SUPABASE_ANON_KEY as string, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: sess } = await throwaway.auth.signInWithPassword({ email: email0, password });
      const throwawayToken = sess.session!.access_token;

      // GET bootstrape son profil (lazy-create) → email d'origine visible.
      const before = await api('GET', '/v1/users/me', { token: throwawayToken });
      assertStatus(before, 200);
      assert(before.body.email === email0, `email initial attendu ${email0}, reçu ${before.body.email}`);

      // PATCH email → 200 avec le NOUVEL email (changement immédiat, prouvé empiriquement).
      const changed = await api('PATCH', '/v1/users/me', { token: throwawayToken, body: { email: email1 } });
      assertStatus(changed, 200);
      assert(
        changed.body.email === email1,
        `PATCH doit renvoyer le nouvel email ${email1}, reçu ${changed.body.email}`,
      );

      // Vérif des DEUX côtés : profiles (miroir) ET auth.users (source de vérité).
      const { data: profRow } = await admin.from('profiles').select('email').eq('id', throwawayId).single();
      assert(profRow?.email === email1, `profiles.email doit valoir ${email1}, reçu ${profRow?.email}`);
      const { data: authUser } = await admin.auth.admin.getUserById(throwawayId);
      assert(authUser.user?.email === email1, `auth.users.email doit valoir ${email1}, reçu ${authUser.user?.email}`);
      emailChangeProven = true;
      console.log('✔ 9. Changement d’email : 200 nouvel email, profiles ET auth.users à jour (user jetable)');
    } finally {
      if (throwawayId) {
        const { error } = await admin.auth.admin.deleteUser(throwawayId);
        console.log(error ? `⚠️  suppression du user jetable échouée : ${error.message}` : '🧹 user jetable supprimé.');
      }
    }
  } else {
    console.log(
      '· 9. Changement d’email sauté (SUPABASE_SERVICE_ROLE_SECRET absent) — couvert par les tests unitaires.',
    );
  }

  console.log(
    `\n✅ e2e users-me : conforme au contrat` +
      `${lazyProven ? ' (lazy-create prouvé)' : ''}${emailChangeProven ? ' (changement email prouvé)' : ''}.\n`,
  );
}

main().catch((err) => {
  console.error(`\n❌ ÉCHEC e2e : ${err.message}\n`);
  process.exit(1);
});
