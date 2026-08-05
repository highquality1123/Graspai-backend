import { JobStatus } from '../../jobs/model/job.types';

export const DOCUMENT_KINDS = ['pdf', 'audio', 'video', 'video-overview', 'recording'] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];

/**
 * Kinds acceptés en upload FICHIER (v1) — les autres → 422 `UNSUPPORTED_KIND` :
 * la vidéo passe par `POST …/documents/url` (le legacy ne l'implémente pas en fichier,
 * assumé par le contrat), `recording` est un domaine différé, `video-overview` est généré.
 */
export const UPLOADABLE_KINDS: readonly DocumentKind[] = ['pdf', 'audio'];

/** openapi.yaml → `language` de uploadDocument (ISO 639-1). */
export const DOCUMENT_LANGUAGES = ['en', 'fr', 'it', 'es', 'de', 'da', 'pt', 'nb'] as const;
export type DocumentLanguage = (typeof DOCUMENT_LANGUAGES)[number];

// ── Formes de réponse (openapi.yaml, au champ près) ─────────────────────────

/** openapi.yaml → schema NotebookDocument. */
export interface NotebookDocument {
  id: string;
  label: string;
  kind: DocumentKind;
  extension?: string;
  uploadedAt: string;
  processingStatus: JobStatus;
}

/** openapi.yaml → schema DocumentJobAccepted (202 de l'ingestion). */
export interface DocumentJobAccepted {
  jobId: string;
  estimatedSeconds: number;
  documentId: string;
}

// ── Lignes DB internes (snake_case) — ne sortent JAMAIS telles quelles ──────

/**
 * Ligne `public.documents` — colonnes lues par le domaine. Les métriques d'ingestion legacy
 * (`pages_count`, `length`, `tokens`) restent au pipeline (goal 3) et ne sont pas listées ici.
 */
export interface DocumentRow {
  id: string;
  name: string | null;
  type: string;
  language: string;
  url: string | null;
  container_id: string | null;
  ingest_job_id: string | null;
  created_at: string;
  /** Embed PostgREST `ingest_job:ingest_job_id (status)` (FK migration 008) — null pour un document legacy (aucun job). */
  ingest_job?: { status: JobStatus } | null;
}
