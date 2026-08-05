import { NotebookSummary, SummaryRow } from './model/summary.types';

/**
 * Ligne `summaries` → `NotebookSummary` (contrat). `user_id`, `deleted_at`, `updated_at`
 * ne sortent jamais ; `container_id` sort sous son nom contrat `notebookId`,
 * `created_at` sous `generatedAt` (la ligne naît à la complétion de la génération).
 */
export function toNotebookSummary(row: SummaryRow): NotebookSummary {
  return {
    id: row.id,
    notebookId: row.container_id,
    title: row.title,
    body: row.body,
    wordCount: row.word_count,
    generatedAt: row.created_at,
    sourceDocumentIds: row.source_document_ids,
    length: row.length,
    format: row.format,
  };
}
