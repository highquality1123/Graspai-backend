import { StudySessionRow } from './model/study-session.types';
import { toStudySession } from './study-sessions.mapper';

function row(overrides: Partial<StudySessionRow> = {}): StudySessionRow {
  return {
    id: 's-1',
    user_id: 'user-1',
    notebook_id: 'nb-1',
    duration_seconds: 1500,
    completed_at: '2026-07-16T10:00:00Z',
    created_at: '2026-07-16T10:01:00Z',
    ...overrides,
  };
}

describe('toStudySession', () => {
  it('maps a StudySessionRow to the contract shape (notebook_id -> notebookId, snake -> camel)', () => {
    expect(toStudySession(row({ notebook_id: null }))).toEqual({
      id: 's-1',
      notebookId: null,
      durationSeconds: 1500,
      completedAt: '2026-07-16T10:00:00Z',
      createdAt: '2026-07-16T10:01:00Z',
    });
  });

  it('never leaks internal / raw DB columns', () => {
    const s = toStudySession(row());
    for (const k of ['user_id', 'notebook_id', 'duration_seconds', 'completed_at', 'created_at']) {
      expect(s).not.toHaveProperty(k);
    }
  });
});
