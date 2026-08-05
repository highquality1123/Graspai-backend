import { Job, JobRow } from './model/job.types';

/**
 * Ligne DB → forme `Job` du contrat. Les champs optionnels ne sont présents que lorsqu'ils
 * ont une valeur (stage pendant l'ingestion, resourceId quand ready, error quand failed).
 * Les colonnes internes (user_id, payload, attempts, locked_at, timestamps) ne sont jamais exposées.
 */
export function toJob(row: JobRow): Job {
  const job: Job = {
    jobId: row.id,
    status: row.status,
    resourceType: row.resource_type,
  };
  if (row.stage != null) job.stage = row.stage;
  if (row.resource_id != null) job.resourceId = row.resource_id;
  if (row.progress != null) job.progress = row.progress;
  if (row.error != null) job.error = row.error;
  return job;
}
