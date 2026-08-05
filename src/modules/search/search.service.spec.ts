import { BadRequestException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { escapeLikePattern, SearchService } from './search.service';

type Result = { data?: unknown; error?: unknown };

/** Query builder Supabase mocké : chaînable + thenable (inclut ilike/limit pour Search). */
function chain(result: Result) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'is', 'in', 'order', 'ilike', 'limit'].forEach((m) => {
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

function serviceWith(client: { from: jest.Mock }): SearchService {
  return new SearchService({ getClient: () => client } as unknown as SupabaseService);
}

describe('escapeLikePattern', () => {
  it('escapes % _ and the escape char itself so metacharacters are searched literally', () => {
    expect(escapeLikePattern('100%')).toBe('100\\%');
    expect(escapeLikePattern('mon_document')).toBe('mon\\_document');
    expect(escapeLikePattern('a\\b')).toBe('a\\\\b');
    expect(escapeLikePattern('plain term')).toBe('plain term');
  });
});

describe('SearchService', () => {
  describe('search', () => {
    it('searches "100%" as a literal term — the ilike pattern must not match everything', async () => {
      const containers = chain({ data: [{ id: 'nb-1', name: 'Biology' }], error: null });
      const documents = chain({ data: [], error: null });
      const notes = chain({ data: [], error: null });
      const service = serviceWith(supabaseMock({ containers: [containers], documents: [documents], notes: [notes] }));

      await service.search('user-1', '100%');

      expect(documents.ilike).toHaveBeenCalledWith('name', '%100\\%%');
      expect(notes.ilike).toHaveBeenCalledWith('title', '%100\\%%');
    });

    it('groups notebook/document/note hits, mapped + scoped, with no internal-column leak', async () => {
      const containers = chain({
        data: [
          { id: 'nb-1', name: 'Biology' },
          { id: 'nb-2', name: 'Chemistry' },
        ],
        error: null,
      });
      const documents = chain({ data: [{ id: 'd-1', name: 'Bio intro.pdf', container_id: 'nb-1' }], error: null });
      const notes = chain({
        data: [{ id: 'n-1', title: 'Bio notes', content: 'Cell body', container_id: 'nb-1' }],
        error: null,
      });
      const service = serviceWith(supabaseMock({ containers: [containers], documents: [documents], notes: [notes] }));

      const result = await service.search('user-1', 'bio');

      // notebooks : filtre par nom (seul 'Biology' matche 'bio')
      expect(result.notebooks).toEqual([{ id: 'nb-1', title: 'Biology' }]);
      expect(result.documents).toEqual([{ id: 'd-1', name: 'Bio intro.pdf', notebookId: 'nb-1' }]);
      expect(result.notes).toEqual([{ id: 'n-1', excerpt: 'Cell body', notebookId: 'nb-1' }]);
      expect(result.documents[0]).not.toHaveProperty('container_id');
    });

    it('throws 400 BadRequest when q is empty or whitespace-only', async () => {
      const service = serviceWith(supabaseMock({}));
      await expect(service.search('user-1', '   ')).rejects.toBeInstanceOf(BadRequestException);
    });

    it('returns everything empty when the user has no active notebooks', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: [], error: null })] }));
      const result = await service.search('user-1', 'bio');
      expect(result).toEqual({ notebooks: [], documents: [], notes: [] });
    });
  });
});
