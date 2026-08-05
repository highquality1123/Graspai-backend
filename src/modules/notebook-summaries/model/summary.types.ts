export const SUMMARY_LENGTHS = ['brief', 'standard', 'detailed'] as const;
export type SummaryLength = (typeof SUMMARY_LENGTHS)[number];

export const SUMMARY_FORMATS = ['paragraphs', 'bullet_points', 'outline'] as const;
export type SummaryFormat = (typeof SUMMARY_FORMATS)[number];

// ── Formes de réponse (openapi.yaml, au champ près) ─────────────────────────

/** openapi.yaml → schema NotebookSummary. */
export interface NotebookSummary {
  id: string;
  notebookId: string;
  title: string;
  body: string;
  wordCount: number;
  generatedAt: string;
  sourceDocumentIds: string[];
  length: SummaryLength;
  format: SummaryFormat;
}

/**
 * `jobs.payload` du resourceType 'summary' — posé par le service au POST, lu par le handler.
 * `documentIds` : TOUJOURS résolus (jamais vide) — « tout le notebook » est résolu au POST,
 * pas au run, pour que `sourceDocumentIds` reflète ce qui existait au moment de la demande.
 */
export interface SummaryGenerationPayload {
  notebookId: string;
  documentIds: string[];
  length: SummaryLength;
  format: SummaryFormat;
}

// ── Ligne DB interne (snake_case) — ne sort JAMAIS telle quelle ─────────────

/** Ligne `public.summaries` (migration 011). La ligne naît READY à la complétion du job. */
export interface SummaryRow {
  id: string;
  container_id: string;
  title: string;
  body: string;
  word_count: number;
  source_document_ids: string[];
  length: SummaryLength;
  format: SummaryFormat;
  deleted_at: string | null;
  created_at: string;
}
