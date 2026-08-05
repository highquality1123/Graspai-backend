-- =============================================================================
-- Migration 005 — Table `jobs` : file d'attente + état des traitements asynchrones
-- Aligné sur le schéma `Job` du contrat V2 (openapi.yaml).
-- À APPLIQUER MANUELLEMENT via le SQL Editor Supabase (comme les migrations 001–004).
-- =============================================================================

-- public.jobs definition
CREATE TABLE IF NOT EXISTS public.jobs (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),          -- -> Job.jobId
    user_id       uuid NOT NULL REFERENCES public.profiles(id),        -- propriétaire (scoping auth, non exposé)
    status        text NOT NULL DEFAULT 'pending'                      -- -> Job.status
                  CHECK (status IN ('pending','processing','ready','failed')),
    stage         text NULL                                            -- -> Job.stage (ingestion seulement)
                  CHECK (stage IN ('transcribing','chunking','indexing')),
    resource_type text NOT NULL                                        -- -> Job.resourceType
                  CHECK (resource_type IN ('document','summary','quiz','flashcards','video','podcast','mindmap')),
    resource_id   uuid NULL,                                           -- -> Job.resourceId (rempli quand ready)
    progress      int NULL CHECK (progress >= 0 AND progress <= 100),  -- -> Job.progress
    error         text NULL,                                           -- -> Job.error (rempli quand failed)
    payload       jsonb NULL,                                          -- entrées du worker, NON exposé
    attempts      int NOT NULL DEFAULT 0,                              -- retry/backoff, NON exposé
    locked_at     timestamptz NULL,                                    -- détection d'orphelins, NON exposé
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);

-- Index de claim (le worker lit les 'pending' par ordre d'arrivée) + lookup par utilisateur.
CREATE INDEX IF NOT EXISTS jobs_status_created_at_idx ON public.jobs (status, created_at);
CREATE INDEX IF NOT EXISTS jobs_user_id_idx           ON public.jobs (user_id);

-- updated_at auto-bump.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS jobs_set_updated_at ON public.jobs;
CREATE TRIGGER jobs_set_updated_at
  BEFORE UPDATE ON public.jobs
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- -----------------------------------------------------------------------------
-- claim_next_job() : réclame atomiquement le prochain job 'pending' et le passe
-- 'processing'. FOR UPDATE SKIP LOCKED => correct même avec plusieurs workers
-- (deux conteneurs ne peuvent pas réclamer le même job).
-- -----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.claim_next_job()
RETURNS SETOF public.jobs
LANGUAGE plpgsql
AS $$
DECLARE
  claimed public.jobs;
BEGIN
  SELECT * INTO claimed
  FROM public.jobs
  WHERE status = 'pending'
  ORDER BY created_at
  FOR UPDATE SKIP LOCKED
  LIMIT 1;

  IF NOT FOUND THEN
    RETURN;
  END IF;

  UPDATE public.jobs
     SET status = 'processing',
         locked_at = now(),
         attempts = attempts + 1
   WHERE id = claimed.id
   RETURNING * INTO claimed;

  RETURN NEXT claimed;
END;
$$;
