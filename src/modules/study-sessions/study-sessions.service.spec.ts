import { UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { StudySessionRow } from './model/study-session.types';
import { StudySessionsService } from './study-sessions.service';

type Result = { data?: unknown; error?: unknown };

/** Query builder Supabase mocké : chaînable + thenable ; `single`/`maybeSingle` résolvent `result`. */
function chain(result: Result) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'order'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

/** Client mocké : par TABLE, une file de chaînes consommées dans l'ordre. */
function supabaseMock(byTable: Record<string, ReturnType<typeof chain>[]>) {
  const index: Record<string, number> = {};
  const from = jest.fn((table: string) => {
    const queue = byTable[table] ?? [];
    const i = index[table] ?? 0;
    index[table] = i + 1;
    return queue[i] ?? chain({ data: null, error: null });
  });
  return { from };
}

function serviceWith(client: { from: jest.Mock }): StudySessionsService {
  return new StudySessionsService({ getClient: () => client } as unknown as SupabaseService);
}

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

/** Notebook parent possédé + actif (la vérif lit `containers`). */
const ownedNotebook = () => chain({ data: { id: 'nb-1' }, error: null });

describe('StudySessionsService', () => {
  describe('log', () => {
    it('inserts a session scoped to the user (notebook verified) and returns the mapped StudySession', async () => {
      const insert = chain({ data: row({ notebook_id: 'nb-1' }), error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], study_sessions: [insert] }));

      const result = await service.log('user-1', {
        notebookId: 'nb-1',
        durationSeconds: 1500,
        completedAt: '2026-07-16T10:00:00Z',
      });

      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          notebook_id: 'nb-1',
          duration_seconds: 1500,
          completed_at: '2026-07-16T10:00:00Z',
        }),
      );
      expect(result.durationSeconds).toBe(1500);
      expect(result).not.toHaveProperty('user_id');
    });

    it('allows a null notebookId (session hors notebook) with no notebook check', async () => {
      const insert = chain({ data: row({ notebook_id: null }), error: null });
      const service = serviceWith(supabaseMock({ study_sessions: [insert] }));

      const result = await service.log('user-1', { durationSeconds: 60, completedAt: '2026-07-16T10:00:00Z' });

      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ notebook_id: null }));
      expect(result.notebookId).toBeNull();
    });

    it('throws 422 (VALIDATION_FAILED) when notebookId is provided but not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(
        service.log('user-1', { notebookId: 'nb-x', durationSeconds: 60, completedAt: '2026-07-16T10:00:00Z' }),
      ).rejects.toBeInstanceOf(UnprocessableEntityException);
    });
  });
});
