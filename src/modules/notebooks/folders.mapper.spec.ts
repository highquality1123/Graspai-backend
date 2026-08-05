import { toFolder } from './folders.mapper';
import { FolderRow } from './model/notebook.types';

describe('folders mapper', () => {
  const row: FolderRow = {
    id: 'folder-uuid',
    name: 'School',
    user_id: 'user-uuid',
    deleted_at: null,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T01:00:00Z',
  };

  it('maps name -> label and exposes only contract fields', () => {
    expect(toFolder(row)).toEqual({
      id: 'folder-uuid',
      label: 'School',
      createdAt: '2026-07-11T00:00:00Z',
      updatedAt: '2026-07-11T01:00:00Z',
    });
  });

  it('never leaks user_id / deleted_at / raw name', () => {
    const folder = toFolder(row) as unknown as Record<string, unknown>;
    for (const key of ['user_id', 'deleted_at', 'name']) expect(folder).not.toHaveProperty(key);
  });
});
