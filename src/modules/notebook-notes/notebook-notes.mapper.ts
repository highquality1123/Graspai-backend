import { Note, NoteRow } from './model/note.types';

/**
 * Ligne `notes` → `Note` (contrat). Ne recopie QUE les champs du contrat : `user_id` ne sort
 * JAMAIS. Renommages : container_id -> notebookId, content -> body, document_id -> sourceDocumentId.
 */
export function toNote(row: NoteRow): Note {
  return {
    id: row.id,
    notebookId: row.container_id,
    title: row.title,
    body: row.content,
    sourceDocumentId: row.document_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}
