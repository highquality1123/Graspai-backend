import { SummaryRow } from './model/summary.types';
import { toNotebookSummary } from './notebook-summaries.mapper';

function summaryRow(overrides: Partial<SummaryRow> = {}): SummaryRow {
  return {
    id: 'sum-1',
    container_id: 'nb-1',
    title: 'Biologie cellulaire',
    body: '## Chapitre 1\nLa cellule…',
    word_count: 420,
    source_document_ids: ['doc-1', 'doc-2'],
    length: 'standard',
    format: 'outline',
    deleted_at: null,
    created_at: '2026-07-19T00:00:00Z',
    ...overrides,
  };
}

describe('toNotebookSummary', () => {
  it('maps the contract shape (openapi.yaml → NotebookSummary)', () => {
    expect(toNotebookSummary(summaryRow())).toEqual({
      id: 'sum-1',
      notebookId: 'nb-1',
      title: 'Biologie cellulaire',
      body: '## Chapitre 1\nLa cellule…',
      wordCount: 420,
      generatedAt: '2026-07-19T00:00:00Z',
      sourceDocumentIds: ['doc-1', 'doc-2'],
      length: 'standard',
      format: 'outline',
    });
  });

  it('never leaks internal columns', () => {
    const summary = toNotebookSummary(summaryRow());
    for (const internal of [
      'user_id',
      'container_id',
      'word_count',
      'source_document_ids',
      'deleted_at',
      'created_at',
      'updated_at',
    ]) {
      expect(summary).not.toHaveProperty(internal);
    }
  });
});
