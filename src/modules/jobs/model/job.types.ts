export const JOB_STATUSES = ['pending', 'processing', 'ready', 'failed'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export const JOB_STAGES = ['transcribing', 'chunking', 'indexing'] as const;
export type JobStage = (typeof JOB_STAGES)[number];

export const RESOURCE_TYPES = ['document', 'summary', 'quiz', 'flashcards', 'video', 'podcast', 'mindmap'] as const;
export type ResourceType = (typeof RESOURCE_TYPES)[number];

/** Forme exacte renvoyée par `GET /v1/jobs/:jobId` (openapi.yaml → schema Job). */
export interface Job {
  jobId: string;
  status: JobStatus;
  resourceType: ResourceType;
  stage?: JobStage;
  resourceId?: string;
  progress?: number;
  error?: string;
}

/** Ligne brute de la table `public.jobs` (snake_case). Colonnes internes non exposées. */
export interface JobRow {
  id: string;
  user_id: string;
  status: JobStatus;
  stage: JobStage | null;
  resource_type: ResourceType;
  resource_id: string | null;
  progress: number | null;
  error: string | null;
  payload: unknown;
  attempts: number;
  locked_at: string | null;
  created_at: string;
  updated_at: string;
}
