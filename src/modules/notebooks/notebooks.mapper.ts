import { ContainerRow, Notebook, NotebookListItem } from './model/notebook.types';

/**
 * Ligne `containers` → `Notebook` (contrat). Ne recopie QUE les champs du contrat :
 * `user_id`, `schema_version`, `deleted_at`, `migration_document_id` ne sortent jamais.
 * `title` : `name` est nullable en DB (legacy) ; on garantit un `string` (contrat) via `?? ''`.
 */
export function toNotebook(row: ContainerRow): Notebook {
  return {
    id: row.id,
    title: row.name ?? '',
    folderId: row.folder_id,
    pinned: row.pinned,
    visibility: row.visibility,
    prompt: row.prompt,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/**
 * Ligne `containers` (+ nombre de documents calculé) → `NotebookListItem` (sidebar).
 * N'expose PAS `folderId` (le groupement par dossier est porté par l'arbre, pas par l'item).
 */
export function toNotebookListItem(row: ContainerRow, documentCount: number): NotebookListItem {
  return {
    id: row.id,
    title: row.name ?? '',
    pinned: row.pinned,
    documentCount,
    lastAccessedAt: row.last_accessed_at,
  };
}
