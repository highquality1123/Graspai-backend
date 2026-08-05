import { NoteRow } from './model/note.types';
import { toNote } from './notebook-notes.mapper';

function noteRow(overrides: Partial<NoteRow> = {}): NoteRow {
  return {
    id: 'note-1',
    container_id: 'nb-1',
    user_id: 'user-1',
    title: 'Bio notes',
    content: 'Les mitochondries…',
    document_id: null,
    created_at: '2026-07-15T00:00:00Z',
    updated_at: '2026-07-15T00:00:00Z',
    ...overrides,
  };
}

describe('toNote', () => {
  it('maps a NoteRow to the contract shape (container_id->notebookId, content->body, document_id->sourceDocumentId)', () => {
    const note = toNote(noteRow({ document_id: 'doc-9' }));

    expect(note).toEqual({
      id: 'note-1',
      notebookId: 'nb-1',
      title: 'Bio notes',
      body: 'Les mitochondries…',
      sourceDocumentId: 'doc-9',
      createdAt: '2026-07-15T00:00:00Z',
      updatedAt: '2026-07-15T00:00:00Z',
    });
  });

  it('never leaks internal / raw DB columns', () => {
    const note = toNote(noteRow());
    for (const k of ['user_id', 'container_id', 'content', 'document_id', 'created_at', 'updated_at']) {
      expect(note).not.toHaveProperty(k);
    }
  });

  it('keeps sourceDocumentId null when the note has no source document', () => {
    expect(toNote(noteRow({ document_id: null })).sourceDocumentId).toBeNull();
  });
});
