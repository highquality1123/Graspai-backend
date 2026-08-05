// ── Forme de réponse (openapi.yaml, au champ près) ─────────────────────────

/** openapi.yaml → schema Note. */
export interface Note {
  id: string;
  notebookId: string;
  title: string;
  body: string;
  sourceDocumentId: string | null;
  createdAt: string;
  updatedAt: string;
}

// ── Ligne DB interne (snake_case) — ne sort JAMAIS telle quelle ────────────

/** Ligne `public.notes`. `container_id` = notebook ; `content` = body ; `document_id` = sourceDocumentId. */
export interface NoteRow {
  id: string;
  container_id: string;
  user_id: string;
  title: string;
  content: string;
  document_id: string | null;
  created_at: string;
  updated_at: string;
}
