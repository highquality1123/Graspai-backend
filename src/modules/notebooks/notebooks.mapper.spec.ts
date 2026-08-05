import { ContainerRow } from './model/notebook.types';
import { toNotebook, toNotebookListItem } from './notebooks.mapper';

function row(overrides: Partial<ContainerRow> = {}): ContainerRow {
  return {
    id: 'nb-uuid',
    name: 'Bio 101',
    folder_id: 'folder-uuid',
    user_id: 'user-uuid',
    pinned: true,
    visibility: 'private',
    prompt: 'study cells',
    last_accessed_at: null,
    schema_version: 2,
    deleted_at: null,
    created_at: '2026-07-11T00:00:00Z',
    updated_at: '2026-07-11T01:00:00Z',
    migration_document_id: 'legacy-doc',
    ...overrides,
  };
}

const INTERNAL = ['user_id', 'schema_version', 'deleted_at', 'migration_document_id', 'name', 'folder_id'];

describe('notebooks mapper', () => {
  it('toNotebook exposes exactly the contract fields', () => {
    expect(toNotebook(row())).toEqual({
      id: 'nb-uuid',
      title: 'Bio 101',
      folderId: 'folder-uuid',
      pinned: true,
      visibility: 'private',
      prompt: 'study cells',
      createdAt: '2026-07-11T00:00:00Z',
      updatedAt: '2026-07-11T01:00:00Z',
    });
  });

  it('toNotebook never leaks internal columns', () => {
    const nb = toNotebook(row()) as unknown as Record<string, unknown>;
    for (const key of INTERNAL) expect(nb).not.toHaveProperty(key);
  });

  it('coerces a legacy null name into an empty string title (contract requires string)', () => {
    expect(toNotebook(row({ name: null })).title).toBe('');
  });

  it('toNotebookListItem has the sidebar shape and does not leak folderId/visibility', () => {
    const item = toNotebookListItem(row({ last_accessed_at: '2026-07-10T00:00:00Z' }), 3);
    expect(item).toEqual({
      id: 'nb-uuid',
      title: 'Bio 101',
      pinned: true,
      documentCount: 3,
      lastAccessedAt: '2026-07-10T00:00:00Z',
    });
    expect(item).not.toHaveProperty('folderId');
    expect(item).not.toHaveProperty('visibility');
  });
});
