-- =============================================================================
-- Migration 006 (2/2) — Soft-delete + updated_at auto sur public.folders
--
-- NOTE : la table `folders` EXISTE DÉJÀ (id, created_at, name, user_id, updated_at).
-- Ce n'est PAS une création : on ajoute seulement `deleted_at` (soft-delete, comme les
-- notebooks). `name` est mappé -> `label` côté service (aucun renommage de colonne).
-- La suppression d'un dossier = soft-delete du dossier + détachement de ses notebooks
-- (folder_id -> NULL), fait côté service ; pas de cascade.
--
-- ADDITIF uniquement. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
-- =============================================================================

ALTER TABLE public.folders
  ADD COLUMN IF NOT EXISTS deleted_at timestamptz NULL;

CREATE INDEX IF NOT EXISTS folders_user_active_idx
  ON public.folders (user_id) WHERE deleted_at IS NULL;

-- updated_at auto. Fonction (re)garantie ici aussi -> ce fichier est applicable seul,
-- sans dépendre de l'ordre (ni de 005, ni de 01).
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS folders_set_updated_at ON public.folders;
CREATE TRIGGER folders_set_updated_at
  BEFORE UPDATE ON public.folders
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
