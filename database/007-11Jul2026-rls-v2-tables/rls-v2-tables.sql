-- =============================================================================
-- Migration 007 — Row Level Security sur les tables utilisées par la V2.
-- Objectif : la clé anon (front) ne peut lire/écrire QUE les lignes du user courant
--            via PostgREST direct. Le backend (service-role, BYPASSRLS) n'est PAS impacté
--            (client unique instancié avec SUPABASE_SERVICE_ROLE_SECRET — vérifié dans le code).
-- Additif et réversible. À APPLIQUER MANUELLEMENT (SQL Editor Supabase).
--
-- Pré-vérif conseillée (doit renvoyer true) :
--   SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';
-- =============================================================================

-- ── jobs (table V2 pure) ─────────────────────────────────────────────────────
ALTER TABLE public.jobs ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS jobs_owner ON public.jobs;
CREATE POLICY jobs_owner ON public.jobs
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── containers (PARTAGÉE legacy — backend service-role, donc pas d'impact legacy) ──
ALTER TABLE public.containers ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS containers_owner ON public.containers;
CREATE POLICY containers_owner ON public.containers
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── folders (PARTAGÉE legacy) ────────────────────────────────────────────────
ALTER TABLE public.folders ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS folders_owner ON public.folders;
CREATE POLICY folders_owner ON public.folders
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── documents (PARTAGÉE legacy) ──────────────────────────────────────────────
-- `documents` a un user_id direct (FK profiles), posé de façon fiable à l'insertion
-- (documents.service.ts + audio.service.ts). Policy simple par user_id, comme les autres —
-- couvre aussi un document sans container (qu'une policy par jointure rendrait invisible).
ALTER TABLE public.documents ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS documents_owner ON public.documents;
CREATE POLICY documents_owner ON public.documents
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- ── Durcissement : le RPC de claim des jobs n'a aucune raison d'être appelé par un client ──
REVOKE EXECUTE ON FUNCTION public.claim_next_job() FROM anon, authenticated;

-- =============================================================================
-- ROLLBACK (si besoin) :
--   GRANT EXECUTE ON FUNCTION public.claim_next_job() TO anon, authenticated;
--   DROP POLICY IF EXISTS jobs_owner       ON public.jobs;       ALTER TABLE public.jobs       DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS containers_owner ON public.containers; ALTER TABLE public.containers DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS folders_owner    ON public.folders;    ALTER TABLE public.folders    DISABLE ROW LEVEL SECURITY;
--   DROP POLICY IF EXISTS documents_owner  ON public.documents;  ALTER TABLE public.documents  DISABLE ROW LEVEL SECURITY;
-- =============================================================================
