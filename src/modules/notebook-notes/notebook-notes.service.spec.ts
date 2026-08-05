import { NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { NoteRow } from './model/note.types';
import { NotebookNotesService } from './notebook-notes.service';

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

function serviceWith(client: { from: jest.Mock }): NotebookNotesService {
  return new NotebookNotesService({ getClient: () => client } as unknown as SupabaseService);
}

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    container_id: 'nb-1',
    user_id: 'user-1',
    title: 'Bio',
    content: 'body text',
    document_id: null,
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

/** Notebook parent possédé + actif (la vérif lit `containers`). */
const ownedNotebook = () => chain({ data: { id: 'nb-1' }, error: null });

describe('NotebookNotesService', () => {
  describe('create', () => {
    it('persists document_id from sourceDocumentId (fixes the legacy bug) and returns the mapped Note', async () => {
      const insert = chain({ data: noteRow({ document_id: 'doc-9' }), error: null });
      const ownedDoc = chain({ data: { id: 'doc-9' }, error: null });
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [ownedDoc], notes: [insert] }),
      );

      const result = await service.create('user-1', 'nb-1', {
        title: 'Bio',
        body: 'body text',
        sourceDocumentId: 'doc-9',
      });

      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          container_id: 'nb-1',
          user_id: 'user-1',
          title: 'Bio',
          content: 'body text',
          document_id: 'doc-9',
        }),
      );
      expect(result.sourceDocumentId).toBe('doc-9');
      expect(result).not.toHaveProperty('user_id');
    });

    it('defaults document_id to null when no sourceDocumentId is provided', async () => {
      const insert = chain({ data: noteRow(), error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], notes: [insert] }));

      await service.create('user-1', 'nb-1', { title: 'Bio', body: 'x' });

      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ document_id: null }));
    });

    it('throws 404 when the parent notebook is absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(service.create('user-1', 'nb-x', { title: 'Bio', body: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws 404 when sourceDocumentId is absent, foreign or outside the notebook (no insert, no FK 500)', async () => {
      const insert = chain({ data: noteRow(), error: null });
      const foreignDoc = chain({ data: null, error: null });
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [foreignDoc], notes: [insert] }),
      );

      await expect(
        service.create('user-1', 'nb-1', { title: 'Bio', body: 'x', sourceDocumentId: 'doc-foreign' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(insert.insert).not.toHaveBeenCalled();
    });

    it('does not query documents at all when no sourceDocumentId is provided', async () => {
      const insert = chain({ data: noteRow(), error: null });
      const client = supabaseMock({ containers: [ownedNotebook()], notes: [insert] });
      const service = serviceWith(client);

      await service.create('user-1', 'nb-1', { title: 'Bio', body: 'x' });

      expect(client.from).not.toHaveBeenCalledWith('documents');
    });
  });

  describe('list', () => {
    it('returns the mapped notes of an owned notebook', async () => {
      const rows = chain({ data: [noteRow({ id: 'n1' }), noteRow({ id: 'n2', document_id: 'doc-2' })], error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], notes: [rows] }));

      const result = await service.list('user-1', 'nb-1');

      expect(result).toHaveLength(2);
      expect(result[1].sourceDocumentId).toBe('doc-2');
      expect(result[0]).not.toHaveProperty('user_id');
    });

    it('throws 404 when the parent notebook is absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(service.list('user-1', 'nb-x')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('update', () => {
    it('rejects an empty patch with 422 (minProperties)', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], notes: [chain({ data: noteRow(), error: null })] }),
      );
      await expect(service.update('user-1', 'nb-1', 'note-1', {})).rejects.toBeInstanceOf(UnprocessableEntityException);
    });

    it('maps body -> content column and returns the mapped Note', async () => {
      const owned = chain({ data: noteRow(), error: null });
      const updated = chain({ data: noteRow({ content: 'new body' }), error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], notes: [owned, updated] }));

      const result = await service.update('user-1', 'nb-1', 'note-1', { body: 'new body' });

      expect(updated.update).toHaveBeenCalledWith({ content: 'new body' });
      expect(result.body).toBe('new body');
    });

    it('throws 404 when the note is absent or not owned', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], notes: [chain({ data: null, error: null })] }),
      );
      await expect(service.update('user-1', 'nb-1', 'missing', { title: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('remove', () => {
    it('hard-deletes the note (re-scoped by user_id) after verifying ownership', async () => {
      const owned = chain({ data: noteRow(), error: null });
      const del = chain({ error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], notes: [owned, del] }));

      await service.remove('user-1', 'nb-1', 'note-1');

      expect(del.delete).toHaveBeenCalled();
      expect(del.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('throws 404 when the note is absent or not owned', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], notes: [chain({ data: null, error: null })] }),
      );
      await expect(service.remove('user-1', 'nb-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
