-- =============================================================================
-- Migration 015 — Découpler les notes du document : notes.document_id passe de
-- ON DELETE CASCADE à ON DELETE SET NULL.
--
-- POURQUOI. Une note est du contenu écrit par l'utilisateur lui-même ; elle reste utile
-- sans aucun retrieval, contrairement aux chats/quiz/flashcards. Aujourd'hui, supprimer un
-- document détruit ses notes en cascade (dump 001 : FK `public_notes_documentId_fkey`
-- ON DELETE CASCADE). Après cette migration : le document part, la note RESTE dans son
-- notebook avec `document_id = NULL` (→ `sourceDocumentId: null` au contrat).
-- Débloque le DELETE document (v2-socle-debt §5, blast radius 7→6) ET règle au passage le
-- risque cross-user du sourceDocumentId (une note liée au doc d'un autre user n'est plus
-- détruite si ce doc disparaît — elle est simplement délinkée).
--
-- `document_id` est DÉJÀ nullable (vérifié : dump 001 `document_id uuid NULL`, spec PostgREST
-- live NOT NULL=non) — donc AUCUN `ALTER COLUMN`, seule la contrainte FK change.
-- Impact observé (TEST, 27 Jul) : 23 notes / 78 portent un document_id non nul — ce sont les
-- seules dont le comportement à la suppression du document change. AUCUNE ligne n'est modifiée
-- par cette migration (elle ne touche que la définition de la contrainte).
--
-- ⚠️ NUMÉRO 015 : 012=users/me (appliquée), 013=calendar (Malik), 014=RPC search_vectors/
-- get_random_embeddings (Malik, feature/db-rpc-functions) — en vol, invisibles dans database/.
--
-- Additive et réversible. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 1 — la FK actuelle est bien en CASCADE (doit renvoyer delete_rule = 'CASCADE').
-- Confirme aussi le nom exact de la contrainte avant de la DROP.
-- -----------------------------------------------------------------------------
-- SELECT tc.constraint_name, rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
-- WHERE tc.table_schema = 'public' AND tc.table_name = 'notes'
--   AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'documents';

-- -----------------------------------------------------------------------------
-- PRÉ-VÉRIF 2 — combien de notes seront concernées (document_id non nul).
-- Informatif : la migration ne modifie AUCUNE de ces lignes, elle change leur comportement futur.
-- -----------------------------------------------------------------------------
-- SELECT count(*) AS notes_liees FROM public.notes WHERE document_id IS NOT NULL;

-- -----------------------------------------------------------------------------
-- MIGRATION — swap de la contrainte FK (CASCADE → SET NULL).
-- Idempotent : DROP IF EXISTS puis recréation. `document_id` reste nullable (inchangé),
-- ce qui rend SET NULL valide.
-- -----------------------------------------------------------------------------
ALTER TABLE public.notes
  DROP CONSTRAINT IF EXISTS "public_notes_documentId_fkey";

ALTER TABLE public.notes
  ADD CONSTRAINT "public_notes_documentId_fkey"
  FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE SET NULL;

-- -----------------------------------------------------------------------------
-- POST-VÉRIF — doit renvoyer delete_rule = 'SET NULL'.
-- -----------------------------------------------------------------------------
-- SELECT rc.delete_rule
-- FROM information_schema.table_constraints tc
-- JOIN information_schema.referential_constraints rc
--   ON rc.constraint_name = tc.constraint_name AND rc.constraint_schema = tc.constraint_schema
-- JOIN information_schema.constraint_column_usage ccu
--   ON ccu.constraint_name = rc.unique_constraint_name AND ccu.constraint_schema = rc.unique_constraint_schema
-- WHERE tc.table_schema = 'public' AND tc.table_name = 'notes'
--   AND tc.constraint_type = 'FOREIGN KEY' AND ccu.table_name = 'documents';

-- =============================================================================
-- ROLLBACK (restaure le comportement CASCADE d'origine) :
--   ALTER TABLE public.notes DROP CONSTRAINT IF EXISTS "public_notes_documentId_fkey";
--   ALTER TABLE public.notes ADD CONSTRAINT "public_notes_documentId_fkey"
--     FOREIGN KEY (document_id) REFERENCES public.documents(id) ON DELETE CASCADE;
-- =============================================================================
