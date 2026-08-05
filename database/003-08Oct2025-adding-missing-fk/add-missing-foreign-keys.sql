-- Migration: Adding Missing Foreign Keys
-- Date: 08 Oct 2025
-- Description: Adds missing foreign key constraints and indexes to improve referential integrity

-- chapters TABLE

-- Drop the existing unique index
DROP INDEX IF EXISTS public.chapters_id_idx;

-- Add PRIMARY KEY constraint
ALTER TABLE public.chapters
    ADD CONSTRAINT chapters_pkey PRIMARY KEY (id);

-- clean data - orhans are present
SELECT COUNT(*) as orphaned_chapters_count
FROM public.chapters c
WHERE c.document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = c.document_id
);

DELETE FROM public.chapters
WHERE document_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.documents d
    WHERE d.id = document_id
);

-- Add foreign key constraint for document_id
ALTER TABLE public.chapters
    ADD CONSTRAINT chapters_document_id_fkey
        FOREIGN KEY (document_id)
            REFERENCES public.documents(id)
            ON DELETE CASCADE
            ON UPDATE CASCADE;

-- Add index on document_id for better query performance
CREATE INDEX IF NOT EXISTS chapters_document_id_idx
    ON public.chapters USING btree (document_id);


-- RECORDINGS TABLE

SELECT COUNT(*) as orphaned_recordings_count
FROM public.recordings r
WHERE r.initial_container_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.containers c
    WHERE c.id = r.initial_container_id
);

UPDATE public.recordings
SET initial_container_id = NULL
WHERE initial_container_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1
    FROM public.containers c
    WHERE c.id = initial_container_id
);

-- Add foreign key constraint for initial_container_id
ALTER TABLE public.recordings
    ADD CONSTRAINT recordings_initial_container_id_fkey
        FOREIGN KEY (initial_container_id)
            REFERENCES public.containers(id)
            ON DELETE SET NULL
            ON UPDATE CASCADE;

-- Add index on initial_container_id for better query performance
CREATE INDEX IF NOT EXISTS recordings_initial_container_id_idx
    ON public.recordings USING btree (initial_container_id);


-- SUBSCRIPTIONS TABLE - Add Foreign Key for stripe_price_id

-- Note: First we need to ensure stripe_price_id in subscription_plans_prices is unique
-- Create unique index on stripe_price_id if it doesn't exist
CREATE UNIQUE INDEX IF NOT EXISTS subscription_plans_prices_stripe_price_id_idx
    ON public.subscription_plans_prices USING btree (stripe_price_id)
    WHERE stripe_price_id IS NOT NULL;


-- Add index on stripe_price_id for better query performance
CREATE INDEX IF NOT EXISTS subscriptions_stripe_price_id_idx
    ON public.subscriptions USING btree (stripe_price_id);


-- Add missing indexes on foreign key columns for better JOIN performance

-- Containers table
CREATE INDEX IF NOT EXISTS containers_folder_id_idx
    ON public.containers USING btree (folder_id);

CREATE INDEX IF NOT EXISTS containers_user_id_idx
    ON public.containers USING btree (user_id);

-- Documents table
CREATE INDEX IF NOT EXISTS documents_container_id_idx
    ON public.documents USING btree (container_id);

CREATE INDEX IF NOT EXISTS documents_user_id_idx
    ON public.documents USING btree (user_id);

-- Notes table
CREATE INDEX IF NOT EXISTS notes_document_id_idx
    ON public.notes USING btree (document_id);

CREATE INDEX IF NOT EXISTS notes_container_id_idx
    ON public.notes USING btree (container_id);

CREATE INDEX IF NOT EXISTS notes_user_id_idx
    ON public.notes USING btree (user_id);

-- Chats table
CREATE INDEX IF NOT EXISTS chats_user_id_idx
    ON public.chats USING btree (user_id);

CREATE INDEX IF NOT EXISTS chats_document_id_idx
    ON public.chats USING btree (document_id);

-- Flashcards table
CREATE INDEX IF NOT EXISTS flashcards_flashcards_set_id_idx
    ON public.flashcards USING btree (flashcards_set_id);

-- Flashcards sets table
CREATE INDEX IF NOT EXISTS flashcards_sets_document_id_idx
    ON public.flashcards_sets USING btree (document_id);

-- Quizzes table
CREATE INDEX IF NOT EXISTS quizzes_document_id_idx
    ON public.quizzes USING btree (document_id);

-- Quiz answers table
CREATE INDEX IF NOT EXISTS quiz_answers_quiz_id_idx
    ON public.quiz_answers USING btree (quiz_id);

CREATE INDEX IF NOT EXISTS quiz_answers_user_id_idx
    ON public.quiz_answers USING btree (user_id);

-- Quiz questions table
CREATE INDEX IF NOT EXISTS quiz_questions_quiz_id_idx
    ON public.quiz_questions USING btree (quiz_id);

-- Chat messages table
CREATE INDEX IF NOT EXISTS chat_messages_chat_id_idx
    ON public.chat_messages USING btree (chat_id);

-- Recording chunks table
CREATE INDEX IF NOT EXISTS recording_chunks_recording_id_idx
    ON public.recording_chunks USING btree (recording_id);

-- User subscription statistics table
CREATE INDEX IF NOT EXISTS user_subscription_statistics_user_id_idx
    ON public.user_subscription_statistics USING btree (user_id);

CREATE INDEX IF NOT EXISTS user_subscription_statistics_subscription_plan_name_idx
    ON public.user_subscription_statistics USING btree (subscription_plan_name);

-- Generated videos table
CREATE INDEX IF NOT EXISTS generated_videos_document_id_idx
    ON public.generated_videos USING btree (document_id);

-- Subscriptions table
CREATE INDEX IF NOT EXISTS subscriptions_user_id_idx
    ON public.subscriptions USING btree (user_id);

