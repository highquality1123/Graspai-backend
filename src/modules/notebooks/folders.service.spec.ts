import { NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { FoldersService } from './folders.service';
import { FolderRow } from './model/notebook.types';

type Result = { data?: unknown; error?: unknown };

function chain(result: Result) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['select', 'insert', 'update', 'delete', 'eq', 'is', 'order'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

/** Client mocké : par TABLE, file de chaînes consommées dans l'ordre. */
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

function serviceWith(client: { from: jest.Mock }): FoldersService {
  return new FoldersService({ getClient: () => client } as unknown as SupabaseService);
}

const folderRow: FolderRow = {
  id: 'f1',
  name: 'School',
  user_id: 'user-1',
  deleted_at: null,
  created_at: '2026-07-11T00:00:00Z',
  updated_at: '2026-07-11T00:00:00Z',
};

describe('FoldersService', () => {
  it('create returns the mapped Folder (name -> label)', async () => {
    const insert = chain({ data: folderRow, error: null });
    const service = serviceWith(supabaseMock({ folders: [insert] }));

    const result = await service.create('user-1', 'School');

    expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ user_id: 'user-1', name: 'School' }));
    expect(result).toEqual({
      id: 'f1',
      label: 'School',
      createdAt: folderRow.created_at,
      updatedAt: folderRow.updated_at,
    });
  });

  describe('deleteAndDetach', () => {
    it('detaches notebooks (folder_id -> null) then soft-deletes the folder (no cascade)', async () => {
      const owned = chain({ data: { id: 'f1' }, error: null }); // assertOwned
      const softDelete = chain({ error: null }); // folders update (deleted_at)
      const detach = chain({ error: null }); // containers update (folder_id -> null)
      const client = supabaseMock({ folders: [owned, softDelete], containers: [detach] });
      const service = serviceWith(client);

      await service.deleteAndDetach('user-1', 'f1');

      // Ordre : assertOwned(folders), détachement(containers), soft-delete(folders).
      expect(client.from.mock.calls[1][0]).toBe('containers');
      expect(detach.update).toHaveBeenCalledWith({ folder_id: null });
      expect(detach.delete).not.toHaveBeenCalled(); // détachement, PAS de suppression de containers
      expect(client.from.mock.calls[2][0]).toBe('folders');
      expect(softDelete.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
    });

    it('throws 404 when the folder is absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ folders: [chain({ data: null, error: null })] }));
      await expect(service.deleteAndDetach('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
