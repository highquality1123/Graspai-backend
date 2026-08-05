import { Folder, FolderRow } from './model/notebook.types';

/**
 * Ligne `folders` → `Folder` (contrat). `name` → `label` (aucun renommage de colonne).
 * `user_id` et `deleted_at` ne sortent jamais.
 */
export function toFolder(row: FolderRow): Folder {
  return {
    id: row.id,
    label: row.name ?? '',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
