-- Migration: Add Performance Indexes
-- Date: 10 Oct 2025
-- Description: Adds missing indexes and composite indexes to fix Supabase linter warnings
--              and optimize queries with ORDER BY clauses

-- ============================================================================
-- CLEANUP: Remove Duplicate Indexes
-- ============================================================================

-- Drop duplicate index on documents.container_id 
-- Migration 002 created idx_documents_container_id
-- Migration 003 created documents_container_id_idx (keep this one)
DROP INDEX IF EXISTS public.idx_documents_container_id;

-- Drop redundant single-column index on containers.user_id
-- Migration 002 created idx_containers_user_id_folder_id (composite - keep this)
-- Migration 003 created containers_user_id_idx (single column - redundant)
-- Composite index can serve queries on user_id alone
DROP INDEX IF EXISTS public.containers_user_id_idx;

-- Drop redundant index on folders.user_id if it was created elsewhere
-- Migration 002 created idx_folders_user_id
-- This is fine to keep as it's a simple index and commonly queried

-- ============================================================================
-- MISSING SIMPLE INDEXES (From Supabase Linter Report - Fresh from Dev)
-- ============================================================================

-- Recordings table - user_id FK index (recordings_fk - column 6)
CREATE INDEX IF NOT EXISTS recordings_user_id_idx
    ON public.recordings USING btree (user_id);

-- Subscription plans prices - subscription_plan_name FK index (column 1)
-- This is the foreign key to subscription_plans table
CREATE INDEX IF NOT EXISTS subscription_plans_prices_subscription_plan_name_idx
    ON public.subscription_plans_prices USING btree (subscription_plan_name);


-- ============================================================================
-- COMPOSITE INDEXES FOR ORDER BY OPTIMIZATION (Performance Critical)
-- ============================================================================

-- Chat messages: Optimize "WHERE chat_id = X ORDER BY created_at DESC"
-- This is the slow query identified in the performance report
DROP INDEX IF EXISTS public.chat_messages_chat_id_idx;  -- Remove single-column index
CREATE INDEX IF NOT EXISTS chat_messages_chat_id_created_at_idx
    ON public.chat_messages USING btree (chat_id, created_at DESC);

-- Documents: Optimize "WHERE user_id = X ORDER BY created_at DESC"
-- Used in getDocumentsByUserId
CREATE INDEX IF NOT EXISTS documents_user_id_created_at_idx
    ON public.documents USING btree (user_id, created_at DESC);

-- Recordings: Optimize "WHERE user_id = X ORDER BY created_at DESC"
-- Used in getMyRecordingsList
CREATE INDEX IF NOT EXISTS recordings_user_id_created_at_idx
    ON public.recordings USING btree (user_id, created_at DESC);

-- Recording chunks: Optimize "WHERE recording_id = X ORDER BY index ASC"
-- Critical for audio chunk assembly
DROP INDEX IF EXISTS public.recording_chunks_recording_id_idx;  -- Remove single-column
CREATE INDEX IF NOT EXISTS recording_chunks_recording_id_index_idx
    ON public.recording_chunks USING btree (recording_id, index ASC);

-- User subscription statistics: Optimize "WHERE user_id = X ORDER BY date_from DESC"
-- Used in getUserSession
DROP INDEX IF EXISTS public.user_subscription_statistics_user_id_idx;  -- Remove single-column
CREATE INDEX IF NOT EXISTS user_subscription_statistics_user_id_date_from_idx
    ON public.user_subscription_statistics USING btree (user_id, date_from DESC);


-- ============================================================================
-- ADDITIONAL PERFORMANCE INDEXES
-- ============================================================================

-- Embeddings: Add index for vector similarity searches
CREATE INDEX IF NOT EXISTS embeddings_document_id_idx
    ON public.embeddings USING btree (document_id);

-- Subscriptions: Composite index for user status queries
CREATE INDEX IF NOT EXISTS subscriptions_user_id_status_idx
    ON public.subscriptions USING btree (user_id, subscription_status);

-- Chats: Composite for user's chats ordered by date
CREATE INDEX IF NOT EXISTS chats_user_id_created_at_idx
    ON public.chats USING btree (user_id, created_at DESC);



