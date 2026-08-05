-- =============================================================================
-- Migration 008 — `documents.ingest_job_id` : lien document → job d'ingestion V2.
-- Une seule source de vérité pour `processingStatus` : la ligne `jobs` (arbitrage C).
-- Les ~136k documents legacy restent à NULL → mappés `processingStatus: 'ready'`.
-- Additif et réversible. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 1 — comportements ON DELETE des FK enfants de `documents`.
-- Attendu : embeddings_fk → delete_rule = 'CASCADE' (confirme la destruction des
-- embeddings au DELETE, comme l'exige le contrat). Pour `chapters` : quel que soit
-- le résultat, le service V2 supprimera la ligne `chapters` explicitement avant le
-- document (robuste avec ou sans cascade, et on ne touche pas à une FK legacy).
-- Si embeddings ≠ CASCADE : STOP, me le signaler avant d'appliquer la suite.
-- -----------------------------------------------------------------------------
-- SELECT tc.table_name AS child_table, tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
-- WHERE tc.constraint_type = 'FOREIGN KEY'
--   AND ccu.table_schema = 'public' AND ccu.table_name = 'documents';

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 2 — la colonne n'existe pas déjà (doit renvoyer 0 ligne).
-- -----------------------------------------------------------------------------
-- SELECT column_name FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'ingest_job_id';

-- -----------------------------------------------------------------------------
-- MIGRATION — colonne + FK vers jobs.
-- ON DELETE SET NULL : si une ligne `jobs` est purgée un jour (rétention future),
-- le document retombe sur la sémantique legacy (NULL → 'ready') au lieu de casser.
-- La FK est indispensable aussi pour l'embed PostgREST du statut dans listDocuments
-- (`select('*, jobs:ingest_job_id(status)')`).
-- -----------------------------------------------------------------------------
ALTER TABLE public.documents
  ADD COLUMN ingest_job_id uuid NULL;

ALTER TABLE public.documents
  ADD CONSTRAINT documents_ingest_job_id_fkey
  FOREIGN KEY (ingest_job_id) REFERENCES public.jobs(id) ON DELETE SET NULL;

-- Index : sert la FK côté jobs (ON DELETE SET NULL sans seq scan) et les lookups inverses.
CREATE INDEX IF NOT EXISTS documents_ingest_job_id_idx
  ON public.documents (ingest_job_id)
  WHERE ingest_job_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- POST-VÉRIF — doit renvoyer 1 ligne (uuid, YES) :
-- -----------------------------------------------------------------------------
-- SELECT data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'documents' AND column_name = 'ingest_job_id';

-- =============================================================================
-- ROLLBACK (si besoin) — la FK et l'index tombent avec la colonne :
--   ALTER TABLE public.documents DROP COLUMN IF EXISTS ingest_job_id;
-- =============================================================================
