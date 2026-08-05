import { DocumentRow } from './model/document.types';
import { toNotebookDocument } from './notebook-documents.mapper';

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    name: 'Cours de bio.pdf',
    type: 'pdf',
    language: 'fr',
    url: 'https://bucket.s3.eu-west-1.amazonaws.com/abc123.pdf',
    container_id: 'nb-1',
    ingest_job_id: null,
    created_at: '2026-07-15T00:00:00Z',
    ingest_job: null,
    ...overrides,
  };
}

describe('toNotebookDocument', () => {
  it('maps the contract shape (openapi.yaml → NotebookDocument)', () => {
    const doc = toNotebookDocument(documentRow({ ingest_job_id: 'job-1', ingest_job: { status: 'processing' } }));
    expect(doc).toEqual({
      id: 'doc-1',
      label: 'Cours de bio.pdf',
      kind: 'pdf',
      extension: 'pdf',
      uploadedAt: '2026-07-15T00:00:00Z',
      processingStatus: 'processing',
    });
  });

  it('never leaks internal columns', () => {
    const doc = toNotebookDocument(documentRow());
    for (const internal of [
      'user_id',
      'url',
      'container_id',
      'ingest_job_id',
      'ingest_job',
      'name',
      'type',
      'created_at',
    ]) {
      expect(doc).not.toHaveProperty(internal);
    }
  });

  it('falls back to ready for a document without job (legacy)', () => {
    expect(toNotebookDocument(documentRow({ ingest_job: null })).processingStatus).toBe('ready');
    expect(toNotebookDocument(documentRow({ ingest_job: undefined })).processingStatus).toBe('ready');
  });

  it('guarantees a string label when name is null (contract required field)', () => {
    expect(toNotebookDocument(documentRow({ name: null })).label).toBe('');
  });

  it('omits extension when not derivable from url', () => {
    expect(toNotebookDocument(documentRow({ url: null }))).not.toHaveProperty('extension');
    expect(toNotebookDocument(documentRow({ url: 'https://bucket.s3.amazonaws.com/no-extension' }))).not.toHaveProperty(
      'extension',
    );
  });
});
