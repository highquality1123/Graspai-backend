-- =============================================================================
-- Migration 009 — updated_at auto + RLS sur public.notes
--
-- NOTE : la table `notes` EXISTE DÉJÀ (id, created_at, updated_at, document_id,
-- user_id, title, content, container_id). Ce n'est PAS une création.
--
-- PAS de soft-delete ici — décision CONTRAT, pas un oubli (openapi.yaml:752-753 :
-- « le soft-delete n'est gelé que pour les notebooks en v1 ; documents/notes
-- pourront s'aligner plus tard »). Donc AUCUNE colonne `deleted_at` sur notes :
--   • DELETE d'une note = hard delete (comme documents), scopé user_id côté service ;
--   • une note « cesse d'être servie » quand son notebook parent est soft-deleted
--     (openapi.yaml:204) — géré dans la COUCHE DE LECTURE du service (le container
--     parent doit être actif), jamais au niveau de la table notes.
--
-- Cette migration aligne `notes` sur le socle V2 pour DEUX choses seulement :
--   1. trigger `updated_at` auto — neutralise le hack legacy `updated_at: 'NOW()'`
--      (notes.service.ts:59), exactement comme containers (006/01) et folders (006/02) ;
--   2. RLS `notes_owner` — `notes` manquait à la 007 ; la clé anon du front ne voit
--      que ses propres notes. Backend service-role (BYPASSRLS) NON impacté.
--
-- ADDITIF, réversible, idempotent. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
--
-- Pré-vérif RLS conseillée (doit renvoyer true) :
--   SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';
-- =============================================================================

-- ── 1. updated_at auto ───────────────────────────────────────────────────────
-- Fonction (re)garantie ici -> ce fichier est applicable seul, sans dépendre de 005/006.
CREATE OR REPLACE FUNCTION public.set_updated_at() RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS notes_set_updated_at ON public.notes;
CREATE TRIGGER notes_set_updated_at
  BEFORE UPDATE ON public.notes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- ── 2. Row Level Security ────────────────────────────────────────────────────
-- `notes` a un `user_id` direct (FK profiles) posé à l'insertion -> policy simple
-- par user, exactement comme documents/containers/folders en 007.
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS notes_owner ON public.notes;
CREATE POLICY notes_owner ON public.notes
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- =============================================================================
-- ROLLBACK (si besoin) :
--   DROP POLICY IF EXISTS notes_owner ON public.notes;
--   ALTER TABLE public.notes DISABLE ROW LEVEL SECURITY;
--   DROP TRIGGER IF EXISTS notes_set_updated_at ON public.notes;
-- =============================================================================
