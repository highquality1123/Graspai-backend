import { JobContext } from '../../jobs/job-handler';
import { JobRow } from '../../jobs/model/job.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { SummaryGenerationPayload } from '../model/summary.types';
import { SummaryGenerationHandler } from './summary-generation.handler';
import { SummaryGenerator } from './summary-generator';
import { DocumentSource, SummarySourceReader } from './summary-source-reader';

function jobRow(payload: unknown): JobRow {
  return {
    id: 'job-1',
    user_id: 'user-1',
    status: 'processing',
    stage: null,
    resource_type: 'summary',
    resource_id: null,
    progress: null,
    error: null,
    payload,
    attempts: 1,
    locked_at: null,
    created_at: '2026-07-19T00:00:00Z',
    updated_at: '2026-07-19T00:00:00Z',
  };
}

function payload(overrides: Partial<SummaryGenerationPayload> = {}): SummaryGenerationPayload {
  return { notebookId: 'nb-1', documentIds: ['doc-1'], length: 'brief', format: 'paragraphs', ...overrides };
}

function ctxMock(): { ctx: JobContext; progress: number[] } {
  const progress: number[] = [];
  return {
    progress,
    ctx: {
      setStage: jest.fn(),
      setProgress: jest.fn(async (p) => {
        progress.push(p);
      }),
    },
  };
}

function insertChain(result: { error: unknown } = { error: null }) {
  const c: Record<string, jest.Mock | ((...a: unknown[]) => unknown)> = {};
  c.insert = jest.fn(() => c);
  c.then = (resolve: (v: unknown) => unknown) => Promise.resolve(result).then(resolve);
  return c;
}

function handlerWith(overrides: {
  sources?: DocumentSource[];
  generated?: { title: string; body: string };
  chain?: ReturnType<typeof insertChain>;
}) {
  const chain = overrides.chain ?? insertChain();
  const supabase = { getClient: () => ({ from: jest.fn(() => chain) }) };
  const reader = {
    read: jest
      .fn()
      .mockResolvedValue(
        overrides.sources ?? [{ documentId: 'doc-1', label: 'L', pieces: [{ content: 'c', page: 1 }] }],
      ),
  };
  const generator = {
    generate: jest.fn(
      async (_s: unknown, _l: unknown, _f: unknown, hooks?: { afterChapters?: () => Promise<void> }) => {
        await hooks?.afterChapters?.();
        return overrides.generated ?? { title: 'Titre', body: 'un deux trois quatre' };
      },
    ),
  };
  return {
    handler: new SummaryGenerationHandler(
      supabase as unknown as SupabaseService,
      reader as unknown as SummarySourceReader,
      generator as unknown as SummaryGenerator,
    ),
    reader,
    generator,
    chain,
  };
}

describe('SummaryGenerationHandler', () => {
  it('reads sources, generates, inserts the summary row and resolves with its id (progress 10→40→80)', async () => {
    const { handler, chain, reader } = handlerWith({});
    const { ctx, progress } = ctxMock();

    const result = await handler.run(jobRow(payload()), ctx);

    expect(reader.read).toHaveBeenCalledWith(['doc-1']);
    expect(chain.insert).toHaveBeenCalledWith(
      expect.objectContaining({
        user_id: 'user-1',
        container_id: 'nb-1',
        title: 'Titre',
        body: 'un deux trois quatre',
        word_count: 4,
        source_document_ids: ['doc-1'],
        length: 'brief',
        format: 'paragraphs',
      }),
    );
    expect(result.resourceId).toEqual(expect.any(String));
    expect(progress).toEqual([10, 40, 80]);
    expect(ctx.setStage).not.toHaveBeenCalled(); // stage réservé à l'ingestion (contrat)
  });

  it('fails when the sources disappeared between POST and run (empty index)', async () => {
    const { handler } = handlerWith({ sources: [{ documentId: 'doc-1', label: 'L', pieces: [] }] });
    await expect(handler.run(jobRow(payload()), ctxMock().ctx)).rejects.toThrow(/No source content/);
  });

  it('throws on an invalid payload (worker handles retry/failed)', async () => {
    const { handler } = handlerWith({});
    const { ctx } = ctxMock();
    await expect(handler.run(jobRow(null), ctx)).rejects.toThrow(/invalid payload/);
    await expect(handler.run(jobRow(payload({ documentIds: [] })), ctx)).rejects.toThrow(/invalid payload/);
  });

  it('surfaces insert failures (the job must fail, not silently succeed)', async () => {
    const { handler } = handlerWith({ chain: insertChain({ error: { message: 'boom' } }) });
    await expect(handler.run(jobRow(payload()), ctxMock().ctx)).rejects.toThrow(/boom/);
  });
});
