import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { NotebookDocumentsService } from '../notebook-documents/notebook-documents.service';
import { SupabaseService } from '../supabase/supabase.service';
import { ContainerRow } from './model/notebook.types';
import { NotebooksService } from './notebooks.service';

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

/** Client mocké : par TABLE, une file de chaînes consommées dans l'ordre (pas d'ordre global fragile). */
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

function serviceWith(client: { from: jest.Mock }, documents?: { list: jest.Mock }): NotebooksService {
  const docs = documents ?? { list: jest.fn().mockResolvedValue([]) };
  return new NotebooksService(
    { getClient: () => client } as unknown as SupabaseService,
    docs as unknown as NotebookDocumentsService,
  );
}

function containerRow(overrides: Partial<ContainerRow> = {}): ContainerRow {
  return {
    id: 'nb-1',
    name: 'Bio',
    folder_id: null,
    user_id: 'user-1',
    pinned: false,
    visibility: 'private',
    prompt: null,
    last_accessed_at: null,
    schema_version: 2,
    deleted_at: null,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T00:00:00Z',
    migration_document_id: null,
    ...overrides,
  };
}

describe('NotebooksService', () => {
  describe('getDetail', () => {
    it('returns the mapped Notebook with its documents (NotebookDetail)', async () => {
      const owned = chain({ data: containerRow({ name: 'Bio' }), error: null });
      const documents = {
        list: jest.fn().mockResolvedValue([{ id: 'doc-1', label: 'Cours', kind: 'pdf', processingStatus: 'ready' }]),
      };
      const service = serviceWith(supabaseMock({ containers: [owned] }), documents);

      const result = await service.getDetail('user-1', 'nb-1');

      expect(documents.list).toHaveBeenCalledWith('user-1', 'nb-1');
      expect(result.title).toBe('Bio');
      expect(result.documents).toHaveLength(1);
      expect(result).not.toHaveProperty('schema_version');
    });

    it('throws 404 when absent or not owned (documents never fetched)', async () => {
      const documents = { list: jest.fn() };
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }), documents);

      await expect(service.getDetail('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(documents.list).not.toHaveBeenCalled();
    });
  });

  it('create inserts schema_version=2 and returns the mapped Notebook', async () => {
    const insert = chain({ data: containerRow({ name: 'Bio' }), error: null });
    const service = serviceWith(supabaseMock({ containers: [insert] }));

    const result = await service.create('user-1', { title: 'Bio' });

    expect(insert.insert).toHaveBeenCalledWith(
      expect.objectContaining({ name: 'Bio', user_id: 'user-1', schema_version: 2, visibility: 'private' }),
    );
    expect(result.title).toBe('Bio');
    expect(result).not.toHaveProperty('schema_version');
  });

  describe('softDelete', () => {
    it('sets deleted_at after verifying ownership', async () => {
      const owned = chain({ data: containerRow(), error: null });
      const del = chain({ error: null });
      const service = serviceWith(supabaseMock({ containers: [owned, del] }));

      await service.softDelete('user-1', 'nb-1');

      expect(del.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    });

    it('throws 404 when absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(service.softDelete('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects an empty patch with 422 (minProperties)', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: containerRow(), error: null })] }));
      await expect(service.update('user-1', 'nb-1', {})).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('maps title -> name column', async () => {
      const owned = chain({ data: containerRow(), error: null });
      const updated = chain({ data: containerRow({ name: 'Chemistry' }), error: null });
      const service = serviceWith(supabaseMock({ containers: [owned, updated] }));

      const result = await service.update('user-1', 'nb-1', { title: 'Chemistry' });

      expect(updated.update).toHaveBeenCalledWith({ name: 'Chemistry' });
      expect(result.title).toBe('Chemistry');
    });
  });

  it('togglePin flips the pinned flag', async () => {
    const owned = chain({ data: containerRow({ pinned: false }), error: null });
    const updated = chain({ data: containerRow({ pinned: true }), error: null });
    const service = serviceWith(supabaseMock({ containers: [owned, updated] }));

    const result = await service.togglePin('user-1', 'nb-1');

    expect(updated.update).toHaveBeenCalledWith({ pinned: true });
    expect(result.pinned).toBe(true);
  });

  describe('getTree (contract shape)', () => {
    it('returns { folders[], rootNotebooks[] } with items grouped and counted', async () => {
      const service = serviceWith(
        supabaseMock({
          folders: [chain({ data: [{ id: 'f1', name: 'School' }], error: null })],
          containers: [
            chain({
              data: [
                containerRow({ id: 'c1', name: 'In folder', folder_id: 'f1' }),
                containerRow({ id: 'c2', name: 'At root', folder_id: null }),
              ],
              error: null,
            }),
          ],
          documents: [chain({ data: [{ container_id: 'c1' }, { container_id: 'c1' }], error: null })],
        }),
      );

      const tree = await service.getTree('user-1');

      expect(Object.keys(tree).sort()).toEqual(['folders', 'rootNotebooks']);
      expect(tree.folders).toEqual([
        {
          id: 'f1',
          label: 'School',
          notebooks: [{ id: 'c1', title: 'In folder', pinned: false, documentCount: 2, lastAccessedAt: null }],
        },
      ]);
      expect(tree.rootNotebooks).toEqual([
        { id: 'c2', title: 'At root', pinned: false, documentCount: 0, lastAccessedAt: null },
      ]);
    });

    it('drops a notebook whose folder is gone back to the root (never lost)', async () => {
      const service = serviceWith(
        supabaseMock({
          folders: [chain({ data: [], error: null })],
          containers: [chain({ data: [containerRow({ id: 'c1', folder_id: 'deleted-folder' })], error: null })],
          documents: [chain({ data: [], error: null })],
        }),
      );

      const tree = await service.getTree('user-1');

      expect(tree.folders).toEqual([]);
      expect(tree.rootNotebooks).toHaveLength(1);
      expect(tree.rootNotebooks[0].id).toBe('c1');
    });
  });
});
