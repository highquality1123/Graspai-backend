import { JobContext } from '../../jobs/job-handler';
import { JobRow } from '../../jobs/model/job.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { DocumentStorageService } from '../storage/document-storage.service';
import { DocumentIngestionHandler, IngestionPayload } from './document-ingestion.handler';
import { AudioExtractor } from './extraction/audio.extractor';
import { ExtractedContent } from './extraction/extracted-content';
import { PdfExtractor } from './extraction/pdf.extractor';
import { YoutubeExtractor } from './extraction/youtube.extractor';

function jobRow(payload: unknown): JobRow {
  return {
    id: 'job-1',
    user_id: 'user-1',
    status: 'processing',
    stage: null,
    resource_type: 'document',
    resource_id: null,
    progress: null,
    error: null,
    payload,
    attempts: 1,
    locked_at: null,
    created_at: '2026-07-18T00:00:00Z',
    updated_at: '2026-07-18T00:00:00Z',
  };
}

function ctxMock(): { ctx: JobContext; calls: string[] } {
  const calls: string[] = [];
  return {
    calls,
    ctx: {
      setStage: jest.fn(async (stage) => {
        calls.push(`stage:${stage}`);
      }),
      setProgress: jest.fn(async (progress) => {
        calls.push(`progress:${progress}`);
      }),
    },
  };
}

function extractorMock(result: ExtractedContent) {
  return { extract: jest.fn().mockResolvedValue(result) };
}

function updateChain() {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  ['update', 'eq'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve({ error: null }).then(resolve);
  return c;
}

function indexerMock() {
  return { remove: jest.fn().mockResolvedValue(undefined), index: jest.fn().mockResolvedValue(undefined) };
}

function handlerWith(overrides: {
  pdf?: ReturnType<typeof extractorMock>;
  audio?: ReturnType<typeof extractorMock>;
  youtube?: ReturnType<typeof extractorMock>;
  storageGet?: jest.Mock;
  documentsChain?: ReturnType<typeof updateChain>;
  indexer?: ReturnType<typeof indexerMock>;
}) {
  const documents = overrides.documentsChain ?? updateChain();
  const supabase = { getClient: () => ({ from: jest.fn(() => documents) }) };
  const storage = { get: overrides.storageGet ?? jest.fn().mockResolvedValue(Buffer.from('file-bytes')) };
  const noChunks: ExtractedContent = { chunks: [] };
  return new DocumentIngestionHandler(
    supabase as unknown as SupabaseService,
    storage as unknown as DocumentStorageService,
    (overrides.indexer ?? indexerMock()) as unknown as import('./indexer/document-indexer').DocumentIndexer,
    (overrides.pdf ?? extractorMock(noChunks)) as unknown as PdfExtractor,
    (overrides.audio ?? extractorMock(noChunks)) as unknown as AudioExtractor,
    (overrides.youtube ?? extractorMock(noChunks)) as unknown as YoutubeExtractor,
  );
}

function payload(overrides: Partial<IngestionPayload> = {}): IngestionPayload {
  return {
    documentId: 'doc-1',
    kind: 'pdf',
    language: 'en',
    url: 'https://bucket.s3.amazonaws.com/key.pdf',
    storageKey: 'key.pdf',
    mimeType: 'application/pdf',
    ...overrides,
  };
}

describe('DocumentIngestionHandler', () => {
  it('downloads from S3, extracts, purges then indexes — the full pipeline in stage order', async () => {
    const extracted: ExtractedContent = { chunks: [{ content: 'page', page: 1 }] };
    const pdf = extractorMock(extracted);
    const storageGet = jest.fn().mockResolvedValue(Buffer.from('pdf-bytes'));
    const indexer = indexerMock();
    const handler = handlerWith({ pdf, storageGet, indexer });
    const { ctx, calls } = ctxMock();

    const result = await handler.run(jobRow(payload()), ctx);

    expect(storageGet).toHaveBeenCalledWith('key.pdf');
    expect(pdf.extract).toHaveBeenCalledWith(expect.objectContaining({ documentId: 'doc-1' }), expect.any(Buffer));
    expect(indexer.remove).toHaveBeenCalledWith('doc-1');
    expect(indexer.index).toHaveBeenCalledWith({ id: 'doc-1', userId: 'user-1', kind: 'pdf' }, extracted);
    // Idempotence : la purge PRÉCÈDE l'indexation.
    expect(indexer.remove.mock.invocationCallOrder[0]).toBeLessThan(indexer.index.mock.invocationCallOrder[0]);
    expect(result).toEqual({ resourceId: 'doc-1' });
    expect(calls).toEqual([
      'stage:transcribing',
      'progress:40',
      'stage:chunking',
      'progress:70',
      'stage:indexing',
      'progress:95',
    ]);
  });

  it('persists the video duration into documents.length after indexing (legacy parity)', async () => {
    const youtube = extractorMock({ chunks: [] });
    const documentsChain = updateChain();
    const handler = handlerWith({ youtube, documentsChain });

    await handler.run(
      jobRow(payload({ kind: 'video', storageKey: undefined, videoId: 'x', durationSeconds: 212 })),
      ctxMock().ctx,
    );

    expect(documentsChain.update).toHaveBeenCalledWith({ length: 212 });
  });

  it('dispatches video to the youtube extractor without touching S3, and persists the detected language', async () => {
    const youtube = extractorMock({ chunks: [], detectedLanguage: 'fr' });
    const storageGet = jest.fn();
    const documentsChain = updateChain();
    const handler = handlerWith({ youtube, storageGet, documentsChain });

    await handler.run(
      jobRow(payload({ kind: 'video', storageKey: undefined, videoId: 'dQw4w9WgXcQ', language: 'en' })),
      ctxMock().ctx,
    );

    expect(storageGet).not.toHaveBeenCalled();
    expect(youtube.extract).toHaveBeenCalledWith(expect.objectContaining({ videoId: 'dQw4w9WgXcQ' }), null);
    expect(documentsChain.update).toHaveBeenCalledWith({ language: 'fr' });
  });

  it('does not update the row when the detected language matches the payload', async () => {
    const youtube = extractorMock({ chunks: [], detectedLanguage: 'en' });
    const documentsChain = updateChain();
    const handler = handlerWith({ youtube, documentsChain });

    await handler.run(jobRow(payload({ kind: 'video', storageKey: undefined, videoId: 'x' })), ctxMock().ctx);

    expect(documentsChain.update).not.toHaveBeenCalled();
  });

  it('throws on unknown kind, missing documentId, or missing storageKey for file kinds', async () => {
    const handler = handlerWith({});
    const { ctx } = ctxMock();

    await expect(handler.run(jobRow(null), ctx)).rejects.toThrow(/documentId/);
    await expect(handler.run(jobRow(payload({ kind: 'recording' })), ctx)).rejects.toThrow(/No extractor/);
    await expect(handler.run(jobRow(payload({ storageKey: undefined })), ctx)).rejects.toThrow(/storageKey/);
  });
});
