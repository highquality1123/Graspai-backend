-- =============================================================================
-- Migration 006 (1/2) — Colonnes V2 sur public.containers
-- La table `containers` reste le stockage ; le mapping "container -> notebook" est
-- fait côté service (aucun renommage de table).
--
-- ADDITIF uniquement : ajout de colonnes, aucune donnée legacy modifiée par UPDATE.
-- Les lignes existantes prennent la valeur DEFAULT de chaque colonne (opération
-- métadonnée en PG11+, pas de réécriture de table).
--
-- À APPLIQUER MANUELLEMENT via le SQL Editor Supabase (comme 005).
-- =============================================================================

ALTER TABLE public.containers
  ADD COLUMN IF NOT EXISTS deleted_at       timestamptz NULL,                       -- soft-delete : toutes les listes filtrent WHERE deleted_at IS NULL
  ADD COLUMN IF NOT EXISTS pinned           boolean     NOT NULL DEFAULT false,     -- Notebook.pinned
  ADD COLUMN IF NOT EXISTS visibility       text        NOT NULL DEFAULT 'private', -- Notebook.visibility (private | shared)
  ADD COLUMN IF NOT EXISTS prompt           text        NULL,                       -- Notebook.prompt (intention d'étude à la création)
  ADD COLUMN IF NOT EXISTS last_accessed_at timestamptz NULL,                       -- NotebookListItem.lastAccessedAt (null tant qu'aucun tracking d'accès)
  ADD COLUMN IF NOT EXISTS schema_version   smallint    NOT NULL DEFAULT 1;         -- marqueur de type EXPLICITE : 1 = container legacy, 2 = notebook V2

-- CHECK sur visibility (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'containers_visibility_check') THEN
    ALTER TABLE public.containers
      ADD CONSTRAINT containers_visibility_check CHECK (visibility IN ('private', 'shared'));
  END IF;
END $$;

-- Index partiels : les requêtes courantes ne portent que sur les lignes non supprimées.
CREATE INDEX IF NOT EXISTS containers_user_active_idx
  ON public.containers (user_id) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS containers_folder_active_idx
  ON public.containers (folder_id) WHERE deleted_at IS NULL;

-- updated_at auto (réutilise/garantit la fonction posée par la migration 005 - jobs).
-- Bénéfice de bord : neutralise le bug legacy `updated_at: 'NOW()'` (containers.service.ts:227,252)
-- puisque le trigger force NEW.updated_at = now() à chaque UPDATE.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS containers_set_updated_at ON public.containers;
CREATE TRIGGER containers_set_updated_at
  BEFORE UPDATE ON public.containers
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
