import { NotFoundException } from '@nestjs/common';
import { JobQueue } from '../jobs/job-queue';
import { SupabaseService } from '../supabase/supabase.service';
import { NotebookSummariesService } from './notebook-summaries.service';

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

/** Client mocké : par TABLE, une file de chaînes consommées dans l'ordre (pas d'ordre global fragile). */
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

function queueMock() {
  return { enqueue: jest.fn().mockResolvedValue({ jobId: 'job-1', estimatedSeconds: 30 }) };
}

function serviceWith(client: { from: jest.Mock }, queue = queueMock()): NotebookSummariesService {
  return new NotebookSummariesService(
    { getClient: () => client } as unknown as SupabaseService,
    queue as unknown as JobQueue,
  );
}

const ownedNotebook = () => chain({ data: { id: 'nb-1' }, error: null });
const readyDoc = (id: string) => ({ id, ingest_job: { status: 'ready' } });
const legacyDoc = (id: string) => ({ id, ingest_job: null });

function summaryRowData(id = 'sum-1') {
  return {
    id,
    container_id: 'nb-1',
    title: 'T',
    body: 'B',
    word_count: 10,
    source_document_ids: ['doc-1'],
    length: 'brief',
    format: 'paragraphs',
    created_at: '2026-07-19T00:00:00Z',
  };
}

describe('NotebookSummariesService', () => {
  describe('generate', () => {
    it('resolves the whole notebook when documentIds is absent and enqueues the resolved ids', async () => {
      const docs = chain({ data: [readyDoc('doc-1'), legacyDoc('doc-2')], error: null });
      const queue = queueMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [docs] }), queue);

      const result = await service.generate('user-1', 'nb-1', { length: 'brief', format: 'paragraphs' });

      expect(queue.enqueue).toHaveBeenCalledWith('user-1', {
        resourceType: 'summary',
        payload: { notebookId: 'nb-1', documentIds: ['doc-1', 'doc-2'], length: 'brief', format: 'paragraphs' },
      });
      // 202 JobAccepted simple — PAS d'id de ressource (la ligne naît à la complétion).
      expect(result).toEqual({ jobId: 'job-1', estimatedSeconds: 30 });
    });

    it('throws 404 when a requested documentId is absent or not owned (no existence leak)', async () => {
      const docs = chain({ data: [readyDoc('doc-1')], error: null });
      const queue = queueMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [docs] }), queue);

      await expect(
        service.generate('user-1', 'nb-1', {
          documentIds: ['doc-1', 'doc-foreign'],
          length: 'brief',
          format: 'paragraphs',
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(queue.enqueue).not.toHaveBeenCalled();
    });

    it('throws 422 SOURCE_NOT_READY when a source is still being ingested', async () => {
      const docs = chain({
        data: [readyDoc('doc-1'), { id: 'doc-2', ingest_job: { status: 'processing' } }],
        error: null,
      });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [docs] }));

      await expect(service.generate('user-1', 'nb-1', { length: 'brief', format: 'paragraphs' })).rejects.toMatchObject(
        { response: { code: 'SOURCE_NOT_READY' } },
      );
    });

    it('throws 422 NO_SOURCES on an empty notebook', async () => {
      const docs = chain({ data: [], error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [docs] }));

      await expect(service.generate('user-1', 'nb-1', { length: 'brief', format: 'paragraphs' })).rejects.toMatchObject(
        { response: { code: 'NO_SOURCES' } },
      );
    });

    it('throws 404 when the notebook is absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(
        service.generate('user-1', 'missing', { length: 'brief', format: 'paragraphs' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('list', () => {
    it('returns mapped summaries (active only, mapper applied)', async () => {
      const rows = chain({ data: [summaryRowData()], error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], summaries: [rows] }));

      const result = await service.list('user-1', 'nb-1');

      expect(rows.is).toHaveBeenCalledWith('deleted_at', null);
      expect(result).toEqual([
        expect.objectContaining({ id: 'sum-1', notebookId: 'nb-1', wordCount: 10, sourceDocumentIds: ['doc-1'] }),
      ]);
    });
  });

  describe('softDelete', () => {
    it('sets deleted_at after verifying ownership, re-scoped by user_id', async () => {
      const owned = chain({ data: { id: 'sum-1' }, error: null });
      const del = chain({ error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], summaries: [owned, del] }));

      await service.softDelete('user-1', 'nb-1', 'sum-1');

      expect(owned.is).toHaveBeenCalledWith('deleted_at', null);
      expect(del.update).toHaveBeenCalledWith(expect.objectContaining({ deleted_at: expect.any(String) }));
      expect(del.eq).toHaveBeenCalledWith('user_id', 'user-1');
    });

    it('throws 404 when absent, not owned, or already soft-deleted (idempotent-honest)', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], summaries: [chain({ data: null, error: null })] }),
      );
      await expect(service.softDelete('user-1', 'nb-1', 'gone')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('get', () => {
    it('returns the mapped summary', async () => {
      const row = chain({ data: summaryRowData(), error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], summaries: [row] }));

      const result = await service.get('user-1', 'nb-1', 'sum-1');

      expect(result.id).toBe('sum-1');
      expect(result).not.toHaveProperty('container_id');
    });

    it('throws 404 when absent, soft-deleted or not owned', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], summaries: [chain({ data: null, error: null })] }),
      );
      await expect(service.get('user-1', 'nb-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
