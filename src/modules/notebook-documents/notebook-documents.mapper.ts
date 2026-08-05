import { DocumentKind, DocumentRow, NotebookDocument } from './model/document.types';

/** Extension dérivée de l'URL S3 (pas de colonne dédiée en DB) — absente si non dérivable. */
function extensionFrom(url: string | null): string | undefined {
  if (!url) return undefined;
  const match = /\.([a-z0-9]{1,8})$/i.exec(url);
  return match ? match[1].toLowerCase() : undefined;
}

/**
 * Ligne `documents` (+ job d'ingestion embarqué) → `NotebookDocument` (contrat).
 * `processingStatus` = status du job lié via `ingest_job_id` ; un document sans job
 * (les ~136k documents legacy) est par définition déjà ingéré → `ready`.
 * `user_id`, `url`, `container_id`, `ingest_job_id` ne sortent jamais.
 */
export function toNotebookDocument(row: DocumentRow): NotebookDocument {
  const doc: NotebookDocument = {
    id: row.id,
    label: row.name ?? '',
    kind: row.type as DocumentKind,
    uploadedAt: row.created_at,
    processingStatus: row.ingest_job?.status ?? 'ready',
  };
  const extension = extensionFrom(row.url);
  if (extension !== undefined) doc.extension = extension;
  return doc;
}
