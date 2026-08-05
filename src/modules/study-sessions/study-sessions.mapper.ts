import { StudySession, StudySessionRow } from './model/study-session.types';

/**
 * Ligne `study_sessions` → `StudySession` (contrat). Ne recopie QUE les champs du contrat :
 * `user_id` ne sort JAMAIS. Renommages : notebook_id -> notebookId, duration_seconds -> durationSeconds.
 */
export function toStudySession(row: StudySessionRow): StudySession {
  return {
    id: row.id,
    notebookId: row.notebook_id,
    durationSeconds: row.duration_seconds,
    completedAt: row.completed_at,
    createdAt: row.created_at,
  };
}
