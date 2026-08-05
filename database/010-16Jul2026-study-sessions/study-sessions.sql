-- =============================================================================
-- Migration 010 — Table public.study_sessions (journal de focus timer) + RLS
--
-- Nouvelle table (domaine Study Sessions, openapi.yaml:1146 → POST /study-sessions).
-- Immuable : un seul INSERT par session (pas d'update/delete) -> pas de `updated_at`.
-- `notebook_id` NULLABLE (session hors notebook) ; FK -> containers ON DELETE SET NULL
-- pour conserver l'historique d'étude même si le notebook est un jour hard-deleted.
-- Scoping par `user_id` ; RLS `study_sessions_owner` comme les autres tables V2 (007).
--
--
-- ADDITIF, idempotent. À APPLIQUER MANUELLEMENT via le SQL Editor Supabase.
--
-- Pré-vérif RLS conseillée (doit renvoyer true) :
--   SELECT rolbypassrls FROM pg_roles WHERE rolname = 'service_role';
-- =============================================================================

CREATE TABLE IF NOT EXISTS public.study_sessions (
    id uuid DEFAULT gen_random_uuid () NOT NULL,
    user_id uuid NOT NULL,
    notebook_id uuid NULL,
    duration_seconds integer NOT NULL,
    completed_at timestamptz NOT NULL,
    created_at timestamptz DEFAULT now() NOT NULL,
    CONSTRAINT study_sessions_pkey PRIMARY KEY (id),
    -- 1s .. 86400s (= 24h) : borne haute de bon sens, rejette les durées absurdes (Othmane).
    CONSTRAINT study_sessions_duration_range CHECK (duration_seconds >= 1 AND duration_seconds <= 86400),
    CONSTRAINT study_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles (id) ON DELETE CASCADE,
    CONSTRAINT study_sessions_notebook_id_fkey FOREIGN KEY (notebook_id) REFERENCES public.containers (id) ON DELETE SET NULL
);

-- Requêtes streak / stats : par user, triées par date de complétion.
CREATE INDEX IF NOT EXISTS study_sessions_user_completed_idx ON public.study_sessions (user_id, completed_at DESC);

-- ── Row Level Security ────────────────────────────────────────────────────
-- `study_sessions` a un `user_id` direct -> policy simple par user, comme en 007.
ALTER TABLE public.study_sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS study_sessions_owner ON public.study_sessions;

CREATE POLICY study_sessions_owner ON public.study_sessions FOR ALL TO authenticated,
anon USING (user_id = auth.uid ())
WITH
    CHECK (user_id = auth.uid ());

-- =============================================================================
-- ROLLBACK (si besoin) :
--   DROP POLICY IF EXISTS study_sessions_owner ON public.study_sessions;
--   DROP TABLE IF EXISTS public.study_sessions;
-- =============================================================================