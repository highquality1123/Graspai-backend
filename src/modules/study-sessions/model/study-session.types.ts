// ── Forme de réponse (openapi.yaml → schema StudySession, au champ près) ─────

/** openapi.yaml → schema StudySession. */
export interface StudySession {
  id: string;
  notebookId: string | null;
  durationSeconds: number;
  completedAt: string;
  createdAt: string;
}

// ── Ligne DB interne (snake_case) — ne sort JAMAIS telle quelle ────────────

/** Ligne `public.study_sessions`. `notebook_id` -> notebookId ; `user_id` ne sort jamais. */
export interface StudySessionRow {
  id: string;
  user_id: string;
  notebook_id: string | null;
  duration_seconds: number;
  completed_at: string;
  created_at: string;
}
