-- =============================================================================
-- Migration 012 — `profiles` : colonnes du contrat UserProfile + RLS (domaine Users/me).
--
-- 1. Colonnes manquantes du contrat (openapi.yaml → UserProfile) : `language`, `color_mode`,
--    `onboarding_complete`. Additives, sans réécriture de table (défaut non volatile,
--    Postgres 11+) — les ~136k lignes existantes ne sont pas touchées.
-- 2. RLS : `profiles` n'avait AUCUNE policy (vérifié le 21 Jul — rowsecurity=false) : la clé
--    anon pouvait lire TOUTE la table via PostgREST direct, y compris les OTP legacy.
--    Policy stricte `id = auth.uid()` (profiles.id EST l'id auth — pas de colonne user_id) :
--    vérifié au contrat que tout accès cross-user (contact-info, friends) passe par le
--    backend service-role (BYPASSRLS), donc non affecté. EN TEST seulement, comme 007-011 ;
--    la prod est le chantier RLS avec le propriétaire du projet Supabase.
--
-- Additive et réversible. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 1 — les colonnes n'existent pas déjà (doit renvoyer 0 ligne).
-- -----------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND column_name IN ('language', 'color_mode', 'onboarding_complete');

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 2 — état RLS actuel (attendu : rowsecurity = false, 0 policy).
-- -----------------------------------------------------------------------------
-- SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 3 — ⚠️ le trigger d'inscription (auth.users → insert profiles) doit être
-- SECURITY DEFINER (prosecdef = true), sinon la RLS bloquerait la création des profils
-- à l'inscription. Si prosecdef = false ou aucun trigger : STOP, me le signaler.
-- -----------------------------------------------------------------------------
-- SELECT p.proname, p.prosecdef
-- FROM pg_trigger t JOIN pg_proc p ON p.oid = t.tgfoid
-- WHERE t.tgrelid = 'auth.users'::regclass AND NOT t.tgisinternal;

-- -----------------------------------------------------------------------------
-- MIGRATION 1/2 — colonnes du contrat UserProfile.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS language text NULL;                          -- -> UserProfile.language (ISO 639-1, préférence d'interface)

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS color_mode text NULL                         -- -> UserProfile.colorMode
  CHECK (color_mode IN ('light', 'auto', 'dark'));

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS onboarding_complete boolean NOT NULL DEFAULT false; -- -> UserProfile.onboardingComplete

-- -----------------------------------------------------------------------------
-- MIGRATION 2/2 — RLS : chacun ne voit et ne modifie QUE sa propre ligne.
-- Ferme la lecture anon de la table entière (emails + OTP legacy de tous les comptes).
-- Le backend (service-role, BYPASSRLS) et le trigger d'inscription (SECURITY DEFINER,
-- pré-vérif 3) ne sont pas affectés.
-- -----------------------------------------------------------------------------
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS profiles_owner ON public.profiles;
CREATE POLICY profiles_owner ON public.profiles
  FOR ALL TO authenticated, anon
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- -----------------------------------------------------------------------------
-- POST-VÉRIFS.
-- 1. Les 3 colonnes (doit renvoyer 3 lignes : language text YES · color_mode text YES ·
--    onboarding_complete boolean NO) :
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'profiles'
--   AND column_name IN ('language', 'color_mode', 'onboarding_complete');
-- 2. RLS active + policy posée :
-- SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'profiles';
-- SELECT policyname, cmd FROM pg_policies WHERE tablename = 'profiles';
-- 3. Fonctionnel : une INSCRIPTION de test doit toujours créer sa ligne profiles
--    (preuve que le trigger passe la RLS), et le user de test e2e doit toujours pouvoir
--    lire SON profil via PostgREST authentifié.
--
-- =============================================================================
-- ROLLBACK (si besoin) :
--   DROP POLICY IF EXISTS profiles_owner ON public.profiles;
--   ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS onboarding_complete;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS color_mode;
--   ALTER TABLE public.profiles DROP COLUMN IF EXISTS language;
-- =============================================================================
