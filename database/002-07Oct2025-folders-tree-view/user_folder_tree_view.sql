-- Optimized SQL view for user folder tree structure
-- This view replaces multiple queries with a single efficient query
-- that joins folders, containers, and documents with aggregation

CREATE OR REPLACE VIEW user_folder_tree_view AS
WITH container_documents AS (
    -- Aggregate document information per container
    SELECT 
        d.container_id,
        COUNT(d.id) as document_count,
        COUNT(CASE WHEN d.type = 'pdf' THEN 1 END) as pdf_count,
        COUNT(CASE WHEN d.type = 'audio' THEN 1 END) as audio_count,
        COUNT(CASE WHEN d.type = 'video' THEN 1 END) as video_count,
        BOOL_OR(d.type = 'pdf') as has_pdf,
        BOOL_OR(d.type = 'audio') as has_audio,
        BOOL_OR(d.type = 'video') as has_video,
        -- Get document details as JSON array
        COALESCE(
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', d.id,
                    'type', d.type,
                    'name', d.name,
                    'created_at', d.created_at
                ) ORDER BY d.created_at DESC
            ) FILTER (WHERE d.id IS NOT NULL),
            '[]'::json
        ) as documents
    FROM documents d
    WHERE d.container_id IS NOT NULL
    GROUP BY d.container_id
),
folder_containers AS (
    -- Join containers with their document information
    SELECT 
        c.id as container_id,
        c.name as container_name,
        c.folder_id,
        c.user_id,
        c.updated_at as container_updated_at,
        COALESCE(cd.document_count, 0) as document_count,
        COALESCE(cd.pdf_count, 0) as pdf_count,
        COALESCE(cd.audio_count, 0) as audio_count,
        COALESCE(cd.video_count, 0) as video_count,
        COALESCE(cd.has_pdf, false) as has_pdf,
        COALESCE(cd.has_audio, false) as has_audio,
        COALESCE(cd.has_video, false) as has_video,
        COALESCE(cd.documents, '[]'::json) as documents
    FROM containers c
    LEFT JOIN container_documents cd ON c.id = cd.container_id
),
folder_data AS (
    -- Aggregate containers under folders
    SELECT 
        f.id as folder_id,
        f.name as folder_name,
        f.user_id as folder_user_id,
        f.updated_at as folder_updated_at,
        COUNT(fc.container_id) as container_count,
        -- Aggregate containers as JSON array
        COALESCE(
            JSON_AGG(
                JSON_BUILD_OBJECT(
                    'id', fc.container_id,
                    'name', fc.container_name,
                    'folder_id', fc.folder_id,
                    'updated_at', fc.container_updated_at,
                    'has_pdf', fc.has_pdf,
                    'has_audio', fc.has_audio,
                    'has_video', fc.has_video,
                    'documents', fc.documents
                ) ORDER BY fc.container_updated_at DESC
            ) FILTER (WHERE fc.container_id IS NOT NULL),
            '[]'::json
        ) as containers
    FROM folders f
    LEFT JOIN folder_containers fc ON f.id = fc.folder_id
    GROUP BY f.id, f.name, f.user_id, f.updated_at
),
root_containers AS (
    -- Get containers that don't belong to any folder (root containers)
    SELECT 
        fc.container_id,
        fc.container_name,
        fc.folder_id,
        fc.user_id,
        fc.container_updated_at,
        fc.has_pdf,
        fc.has_audio,
        fc.has_video,
        fc.documents
    FROM folder_containers fc
    WHERE fc.folder_id IS NULL
),
user_list AS (
    -- Get all unique user IDs from both folders and containers, filtering out NULLs
    SELECT DISTINCT user_id FROM (
        SELECT folder_user_id as user_id FROM folder_data WHERE folder_user_id IS NOT NULL
        UNION
        SELECT user_id FROM root_containers WHERE user_id IS NOT NULL
    ) all_users
    WHERE user_id IS NOT NULL
),
user_folders_aggregated AS (
    -- Aggregate folders per user separately to avoid duplicates
    SELECT 
        fd.folder_user_id as user_id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', fd.folder_id,
                'name', fd.folder_name,
                'updated_at', fd.folder_updated_at,
                'containers', fd.containers
            ) ORDER BY fd.folder_updated_at DESC
        ) as folders
    FROM folder_data fd
    WHERE fd.folder_user_id IS NOT NULL
    GROUP BY fd.folder_user_id
),
user_root_containers_aggregated AS (
    -- Aggregate root containers per user separately to avoid duplicates
    SELECT 
        rc.user_id,
        JSON_AGG(
            JSON_BUILD_OBJECT(
                'id', rc.container_id,
                'name', rc.container_name,
                'folder_id', rc.folder_id,
                'updated_at', rc.container_updated_at,
                'has_pdf', rc.has_pdf,
                'has_audio', rc.has_audio,
                'has_video', rc.has_video,
                'documents', rc.documents
            ) ORDER BY rc.container_updated_at DESC
        ) as root_containers
    FROM root_containers rc
    WHERE rc.user_id IS NOT NULL
    GROUP BY rc.user_id
)
-- Final result combining folders and root containers per user
SELECT 
    ul.user_id,
    COALESCE(uf.folders, '[]'::json) as folders,
    COALESCE(urc.root_containers, '[]'::json) as root_containers
FROM user_list ul
LEFT JOIN user_folders_aggregated uf ON ul.user_id = uf.user_id
LEFT JOIN user_root_containers_aggregated urc ON ul.user_id = urc.user_id
WHERE ul.user_id IS NOT NULL;

-- Create index for better performance
CREATE INDEX IF NOT EXISTS idx_containers_user_id_folder_id ON containers(user_id, folder_id);
CREATE INDEX IF NOT EXISTS idx_documents_container_id ON documents(container_id);
CREATE INDEX IF NOT EXISTS idx_folders_user_id ON folders(user_id);

