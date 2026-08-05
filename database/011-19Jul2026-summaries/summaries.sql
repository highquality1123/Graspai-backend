-- =============================================================================
-- Migration 011 — Table `summaries` : résumés AI d'un notebook (domaine V2 Summaries).
-- Table V2-PURE (comme `jobs`) : aucune donnée legacy — les résumés legacy vivent dans
-- `chats` (type summary) + `chat_messages` et n'y sont PAS migrés (shape incompatible).
-- La ligne naît À LA COMPLÉTION du job de génération (le 202 ne renvoie pas d'id) :
-- pas de colonne de statut, pas de lien job — `jobs.resource_id` porte le lien à ready.
-- ⚠️ Numérotation : 009 (notes) et 010 (study_sessions) sont RÉSERVÉES (PR Malik non
-- mergée sur v2/phase1) — ne pas se fier au dossier database/ qui saute de 008 à 011.
-- Additive et réversible. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 1 — la fonction de trigger du socle existe (posée par la migration 005).
-- Doit renvoyer 1 ligne. Sinon : appliquer 005 d'abord.
-- -----------------------------------------------------------------------------
-- SELECT proname FROM pg_proc WHERE proname = 'set_updated_at' AND pronamespace = 'public'::regnamespace;

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 2 — la table n'existe pas déjà (doit renvoyer 0 ligne).
-- -----------------------------------------------------------------------------
-- SELECT table_name FROM information_schema.tables
-- WHERE table_schema = 'public' AND table_name = 'summaries';

-- -----------------------------------------------------------------------------
-- MIGRATION — table + index + trigger + RLS.
-- `source_document_ids` : uuid[] DÉNORMALISÉ à dessein (pas de FK par élément possible) —
-- un document supprimé ne casse pas ses résumés, les ids deviennent simplement inertes.
-- FK `container_id` : ON DELETE CASCADE, EXPLICITE — (1) le legacy hard-delete encore les
--   containers (`DELETE /containers`) : un NO ACTION ferait échouer une suppression legacy
--   à cause d'une table V2 (interdit) ; (2) un summary est du contenu dérivé sans enfant —
--   « le notebook part, ses résumés aussi » est le comportement voulu.
-- FK `user_id` : défaut NO ACTION assumé, comme `jobs.user_id` (005) — la suppression de
--   compte traitera jobs+summaries ensemble (chantier dédié, pas cette migration).
-- -----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.summaries (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),        -- -> NotebookSummary.id
    user_id             uuid NOT NULL REFERENCES public.profiles(id),       -- scoping + RLS, non exposé
    container_id        uuid NOT NULL REFERENCES public.containers(id)      -- -> NotebookSummary.notebookId
                        ON DELETE CASCADE,
    title               text NOT NULL,                                      -- -> title (généré LLM, fallback 'Summary')
    body                text NOT NULL,                                      -- -> body (markdown)
    word_count          int  NOT NULL DEFAULT 0 CHECK (word_count >= 0),    -- -> wordCount (calculé à l'insert)
    source_document_ids uuid[] NOT NULL DEFAULT '{}',                       -- -> sourceDocumentIds
    length              text NOT NULL                                       -- -> length
                        CHECK (length IN ('brief','standard','detailed')),
    format              text NOT NULL                                       -- -> format
                        CHECK (format IN ('paragraphs','bullet_points','outline')),
    deleted_at          timestamptz NULL,                                   -- soft-delete (arbitrage B)
    created_at          timestamptz NOT NULL DEFAULT now(),                 -- -> generatedAt
    updated_at          timestamptz NOT NULL DEFAULT now()
);

-- Index de liste (GET /notebooks/:id/summaries — actifs d'un notebook, tri récent d'abord).
CREATE INDEX IF NOT EXISTS summaries_container_user_idx
  ON public.summaries (container_id, user_id, created_at DESC)
  WHERE deleted_at IS NULL;

-- updated_at auto-bump (fonction partagée du socle, migration 005).
DROP TRIGGER IF EXISTS summaries_set_updated_at ON public.summaries;
CREATE TRIGGER summaries_set_updated_at
  BEFORE UPDATE ON public.summaries
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- RLS dès la création (table V2-pure — pas d'impact legacy, même policy que la 007).
ALTER TABLE public.summaries ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS summaries_owner ON public.summaries;
CREATE POLICY summaries_owner ON public.summaries
  FOR ALL TO authenticated, anon
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());

-- -----------------------------------------------------------------------------
-- POST-VÉRIF — doit renvoyer 12 colonnes, et rowsecurity = true :
-- -----------------------------------------------------------------------------
-- SELECT column_name, data_type, is_nullable FROM information_schema.columns
-- WHERE table_schema = 'public' AND table_name = 'summaries' ORDER BY ordinal_position;
-- SELECT rowsecurity FROM pg_tables WHERE schemaname = 'public' AND tablename = 'summaries';
--
-- POST-VÉRIF 3 — la cascade est bien posée (doit renvoyer delete_rule = 'CASCADE') :
-- SELECT rc.delete_rule FROM information_schema.referential_constraints rc
-- JOIN information_schema.table_constraints tc
--   ON tc.constraint_name = rc.constraint_name AND tc.constraint_schema = rc.constraint_schema
-- WHERE tc.table_name = 'summaries' AND tc.constraint_type = 'FOREIGN KEY'
--   AND rc.unique_constraint_name LIKE 'containers%';

-- =============================================================================
-- ROLLBACK (si besoin) — l'index, le trigger et la policy tombent avec la table :
--   DROP TABLE IF EXISTS public.summaries;
-- =============================================================================
