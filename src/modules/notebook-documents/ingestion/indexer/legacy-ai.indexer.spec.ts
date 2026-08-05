import { AiService } from '../../../ai/ai.service';
import { DocumentSourceTypeEnum } from '../../../documents/model/DocumentSourceTypeEnum';
import { SupabaseService } from '../../../supabase/supabase.service';
import { LegacyAiIndexer } from './legacy-ai.indexer';

function deleteChain(result: { error: unknown } = { error: null }) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['delete', 'eq'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

function indexerWith(buildEmbeddings = jest.fn().mockResolvedValue(undefined), chain = deleteChain()) {
  const ai = { buildEmbeddings };
  const supabase = { getClient: () => ({ from: jest.fn(() => chain) }) };
  return {
    indexer: new LegacyAiIndexer(ai as unknown as AiService, supabase as unknown as SupabaseService),
    buildEmbeddings,
    chain,
  };
}

describe('LegacyAiIndexer', () => {
  it('maps CoarseChunks to the exact legacy getDocumentChunks shape (doc_id, page, duration, start, end)', async () => {
    const { indexer, buildEmbeddings } = indexerWith();

    await indexer.index(
      { id: 'doc-1', userId: 'user-1', kind: 'audio' },
      {
        chunks: [
          { content: 'bonjour le monde ', page: 1, duration: 35, start: 0, end: 35 },
          { content: 'suite ', page: 2, duration: 10, start: 35, end: 45 },
        ],
      },
    );

    expect(buildEmbeddings).toHaveBeenCalledWith(
      'user-1',
      expect.objectContaining({ id: 'doc-1' }),
      DocumentSourceTypeEnum.AUDIO,
      null,
      expect.any(Function),
    );
    const getDocumentChunks = buildEmbeddings.mock.calls[0][4];
    await expect(getDocumentChunks()).resolves.toEqual([
      { content: 'bonjour le monde ', doc_id: 'doc-1', page: 1, duration: 35, start: 0, end: 35 },
      { content: 'suite ', doc_id: 'doc-1', page: 2, duration: 10, start: 35, end: 45 },
    ]);
  });

  it('defaults duration/start/end to 0 for pdf chunks (legacy `|| 0` semantics)', async () => {
    const { indexer, buildEmbeddings } = indexerWith();

    await indexer.index({ id: 'doc-1', userId: 'user-1', kind: 'pdf' }, { chunks: [{ content: 'page one', page: 1 }] });

    expect(buildEmbeddings.mock.calls[0][2]).toBe(DocumentSourceTypeEnum.FILE);
    const getDocumentChunks = buildEmbeddings.mock.calls[0][4];
    await expect(getDocumentChunks()).resolves.toEqual([
      { content: 'page one', doc_id: 'doc-1', page: 1, duration: 0, start: 0, end: 0 },
    ]);
  });

  it('remove purges the embeddings of the document (idempotence + future DELETE primitive)', async () => {
    const chain = deleteChain();
    const { indexer } = indexerWith(jest.fn(), chain);

    await indexer.remove('doc-1');

    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('document_id', 'doc-1');
  });

  it('remove surfaces DB errors (the worker must not index on top of a failed purge)', async () => {
    const chain = deleteChain({ error: { message: 'boom' } });
    const { indexer } = indexerWith(jest.fn(), chain);

    await expect(indexer.remove('doc-1')).rejects.toThrow('boom');
  });
});
