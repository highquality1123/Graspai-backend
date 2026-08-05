import { InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { JobQueue } from '../jobs/job-queue';
import { SupabaseService } from '../supabase/supabase.service';
import { DocumentRow } from './model/document.types';
import { NotebookDocumentsService } from './notebook-documents.service';
import { DocumentStorageService } from './storage/document-storage.service';
import { YoutubeMetadataService } from './youtube/youtube-metadata.service';

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

function storageMock() {
  return {
    put: jest.fn().mockResolvedValue('https://bucket.s3.eu-west-1.amazonaws.com/key.pdf'),
    delete: jest.fn().mockResolvedValue(undefined),
    // Comportement réel : clé S3 dérivée d'une url `documents.url` de la forme S3, sinon null.
    keyFromUrl: jest.fn((url: string | null) =>
      url?.startsWith('https://bucket.s3.eu-west-1.amazonaws.com/')
        ? url.slice('https://bucket.s3.eu-west-1.amazonaws.com/'.length)
        : null,
    ),
  };
}

function queueMock() {
  return { enqueue: jest.fn().mockResolvedValue({ jobId: 'job-1', estimatedSeconds: 60 }) };
}

function youtubeMock() {
  return {
    getVideoDetails: jest.fn().mockResolvedValue({ title: 'Ma vidéo', durationSeconds: 90, defaultLanguage: 'fr' }),
  };
}

function serviceWith(
  client: { from: jest.Mock },
  storage = storageMock(),
  queue = queueMock(),
  youtube = youtubeMock(),
): NotebookDocumentsService {
  return new NotebookDocumentsService(
    { getClient: () => client } as unknown as SupabaseService,
    storage as unknown as DocumentStorageService,
    youtube as unknown as YoutubeMetadataService,
    queue as unknown as JobQueue,
  );
}

function file(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    originalname: 'cours.pdf',
    mimetype: 'application/pdf',
    size: 1024,
    buffer: Buffer.from('%PDF-fake'),
    ...overrides,
  } as Express.Multer.File;
}

function documentRow(overrides: Partial<DocumentRow> = {}): DocumentRow {
  return {
    id: 'doc-1',
    name: 'cours.pdf',
    type: 'pdf',
    language: 'en',
    url: 'https://bucket.s3.eu-west-1.amazonaws.com/key.pdf',
    container_id: 'nb-1',
    ingest_job_id: 'job-1',
    created_at: '2026-07-15T00:00:00Z',
    ingest_job: { status: 'pending' },
    ...overrides,
  };
}

const ownedNotebook = () => chain({ data: { id: 'nb-1' }, error: null });

describe('NotebookDocumentsService', () => {
  describe('list', () => {
    it('returns mapped documents with processingStatus from the linked job', async () => {
      const docs = chain({
        data: [documentRow(), documentRow({ id: 'doc-2', ingest_job_id: null, ingest_job: null })],
        error: null,
      });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [docs] }));

      const result = await service.list('user-1', 'nb-1');

      expect(result).toHaveLength(2);
      expect(result[0].processingStatus).toBe('pending');
      expect(result[1].processingStatus).toBe('ready'); // document legacy sans job
      expect(result[0]).not.toHaveProperty('ingest_job');
    });

    it('throws 404 when the notebook is absent or not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(service.list('user-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('upload', () => {
    it('uploads to S3, inserts the row, enqueues the job and returns the 202 shape', async () => {
      const insert = chain({ error: null });
      const link = chain({ error: null });
      const storage = storageMock();
      const queue = queueMock();
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert, link] }),
        storage,
        queue,
      );

      const result = await service.upload('user-1', 'nb-1', file(), { kind: 'pdf' });

      expect(storage.put).toHaveBeenCalledWith(expect.stringMatching(/\.pdf$/), expect.any(Buffer), 'application/pdf');
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({
          user_id: 'user-1',
          container_id: 'nb-1',
          type: 'pdf',
          language: 'en',
          name: 'cours.pdf',
        }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith('user-1', {
        resourceType: 'document',
        payload: expect.objectContaining({ kind: 'pdf', language: 'en' }),
      });
      expect(link.update).toHaveBeenCalledWith({ ingest_job_id: 'job-1' });
      expect(result).toEqual({ jobId: 'job-1', estimatedSeconds: 60, documentId: expect.any(String) });
    });

    it('uses label and language when provided', async () => {
      const insert = chain({ error: null });
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert, chain({ error: null })] }),
      );

      await service.upload('user-1', 'nb-1', file(), { kind: 'pdf', label: 'Mon cours', language: 'fr' });

      expect(insert.insert).toHaveBeenCalledWith(expect.objectContaining({ name: 'Mon cours', language: 'fr' }));
    });

    it('rejects a missing file with 422 VALIDATION_FAILED', async () => {
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()] }));
      await expect(service.upload('user-1', 'nb-1', undefined, { kind: 'pdf' })).rejects.toMatchObject({
        response: { code: 'VALIDATION_FAILED' },
      });
    });

    it('rejects kind video as file upload with 422 UNSUPPORTED_KIND (S3 never touched)', async () => {
      const storage = storageMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()] }), storage);

      await expect(service.upload('user-1', 'nb-1', file(), { kind: 'video' })).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_KIND' },
      });
      expect(storage.put).not.toHaveBeenCalled();
    });

    it('applies the legacy MIME whitelist for real (422 INVALID_FILE_TYPE)', async () => {
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook(), ownedNotebook()] }));

      await expect(
        service.upload('user-1', 'nb-1', file({ mimetype: 'text/plain' }), { kind: 'pdf' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_FILE_TYPE' } });
      await expect(
        service.upload('user-1', 'nb-1', file({ mimetype: 'application/zip' }), { kind: 'audio' }),
      ).rejects.toMatchObject({ response: { code: 'INVALID_FILE_TYPE' } });
    });

    it('rejects oversized files with 422 FILE_TOO_LARGE (pdf infra guard, audio legacy 25Mb)', async () => {
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook(), ownedNotebook()] }));

      await expect(
        service.upload('user-1', 'nb-1', file({ size: 101 * 1024 * 1024 }), { kind: 'pdf' }),
      ).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
      await expect(
        service.upload('user-1', 'nb-1', file({ mimetype: 'audio/mpeg', size: 25 * 1024 * 1024 }), { kind: 'audio' }),
      ).rejects.toMatchObject({ response: { code: 'FILE_TOO_LARGE' } });
    });

    it('compensates (row + S3 object deleted) when enqueue fails', async () => {
      const insert = chain({ error: null });
      const del = chain({ error: null });
      const storage = storageMock();
      const queue = { enqueue: jest.fn().mockRejectedValue(new Error('queue down')) };
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert, del] }),
        storage,
        queue,
      );

      await expect(service.upload('user-1', 'nb-1', file(), { kind: 'pdf' })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(del.delete).toHaveBeenCalled();
      expect(storage.delete).toHaveBeenCalled();
    });

    it('throws 404 before touching S3 when the notebook is not owned', async () => {
      const storage = storageMock();
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }), storage);

      await expect(service.upload('user-1', 'missing', file(), { kind: 'pdf' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
      expect(storage.put).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('deletes the row (re-scoped) then the S3 object, after verifying ownership', async () => {
      const owned = chain({
        data: { id: 'doc-1', url: 'https://bucket.s3.eu-west-1.amazonaws.com/key.pdf' },
        error: null,
      });
      const del = chain({ error: null });
      const storage = storageMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [owned, del] }), storage);

      await service.remove('user-1', 'nb-1', 'doc-1');

      expect(del.delete).toHaveBeenCalled();
      expect(del.eq).toHaveBeenCalledWith('user_id', 'user-1');
      expect(storage.delete).toHaveBeenCalledWith('key.pdf');
    });

    it('does not touch S3 for a video document (YouTube url, no S3 object)', async () => {
      const owned = chain({ data: { id: 'doc-1', url: 'https://www.youtube.com/watch?v=abc' }, error: null });
      const del = chain({ error: null });
      const storage = storageMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [owned, del] }), storage);

      await service.remove('user-1', 'nb-1', 'doc-1');

      expect(del.delete).toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('still succeeds (204) when the S3 delete fails — the row is already gone', async () => {
      const owned = chain({
        data: { id: 'doc-1', url: 'https://bucket.s3.eu-west-1.amazonaws.com/key.pdf' },
        error: null,
      });
      const del = chain({ error: null });
      const storage = storageMock();
      storage.delete.mockRejectedValue(new Error('S3 down'));
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [owned, del] }), storage);

      await expect(service.remove('user-1', 'nb-1', 'doc-1')).resolves.toBeUndefined();
      expect(del.delete).toHaveBeenCalled();
    });

    it('throws 404 before touching the row when the document is absent or not owned', async () => {
      const storage = storageMock();
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [chain({ data: null, error: null })] }),
        storage,
      );

      await expect(service.remove('user-1', 'nb-1', 'missing')).rejects.toBeInstanceOf(NotFoundException);
      expect(storage.delete).not.toHaveBeenCalled();
    });

    it('throws 404 when the parent notebook is not owned', async () => {
      const service = serviceWith(supabaseMock({ containers: [chain({ data: null, error: null })] }));
      await expect(service.remove('user-1', 'missing', 'doc-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('ingestUrl', () => {
    const YT_URL = 'https://www.youtube.com/watch?v=dQw4w9WgXcQ';

    it('creates a video document titled from YouTube metadata and enqueues with videoId', async () => {
      const insert = chain({ error: null });
      const link = chain({ error: null });
      const queue = queueMock();
      const youtube = youtubeMock();
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert, link] }),
        storageMock(),
        queue,
        youtube,
      );

      const result = await service.ingestUrl('user-1', 'nb-1', { url: YT_URL });

      expect(youtube.getVideoDetails).toHaveBeenCalledWith('dQw4w9WgXcQ');
      expect(insert.insert).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'video', name: 'Ma vidéo', url: YT_URL, language: 'en' }),
      );
      expect(queue.enqueue).toHaveBeenCalledWith('user-1', {
        resourceType: 'document',
        payload: expect.objectContaining({
          kind: 'video',
          videoId: 'dQw4w9WgXcQ',
          defaultLanguage: 'fr',
          durationSeconds: 90,
        }),
      });
      expect(result).toEqual({ jobId: 'job-1', estimatedSeconds: 60, documentId: expect.any(String) });
    });

    it('rejects a non-YouTube url with 422 UNSUPPORTED_URL (goal 5 will lift this)', async () => {
      const youtube = youtubeMock();
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()] }), storageMock(), queueMock(), youtube);

      await expect(service.ingestUrl('user-1', 'nb-1', { url: 'https://example.com/article' })).rejects.toMatchObject({
        response: { code: 'UNSUPPORTED_URL' },
      });
      expect(youtube.getVideoDetails).not.toHaveBeenCalled();
    });

    it('propagates metadata failures without creating a document row', async () => {
      const insert = chain({ error: null });
      const youtube = { getVideoDetails: jest.fn().mockRejectedValue(new Error('VIDEO_UNAVAILABLE')) };
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert] }),
        storageMock(),
        queueMock(),
        youtube,
      );

      await expect(service.ingestUrl('user-1', 'nb-1', { url: YT_URL })).rejects.toThrow();
      expect(insert.insert).not.toHaveBeenCalled();
    });

    it('compensates (row deleted, no S3 involved) when enqueue fails', async () => {
      const insert = chain({ error: null });
      const del = chain({ error: null });
      const storage = storageMock();
      const queue = { enqueue: jest.fn().mockRejectedValue(new Error('queue down')) };
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [insert, del] }),
        storage,
        queue,
      );

      await expect(service.ingestUrl('user-1', 'nb-1', { url: YT_URL })).rejects.toBeInstanceOf(
        InternalServerErrorException,
      );
      expect(del.delete).toHaveBeenCalled();
      expect(storage.delete).not.toHaveBeenCalled();
    });
  });

  describe('rename', () => {
    it('updates name after verifying notebook and document ownership', async () => {
      const ownedDoc = chain({ data: { id: 'doc-1' }, error: null });
      const updated = chain({ data: documentRow({ name: 'Nouveau nom' }), error: null });
      const service = serviceWith(supabaseMock({ containers: [ownedNotebook()], documents: [ownedDoc, updated] }));

      const result = await service.rename('user-1', 'nb-1', 'doc-1', { label: 'Nouveau nom' });

      expect(updated.update).toHaveBeenCalledWith({ name: 'Nouveau nom' });
      expect(result.label).toBe('Nouveau nom');
    });

    it('throws 404 when the document is absent or not in this notebook', async () => {
      const service = serviceWith(
        supabaseMock({ containers: [ownedNotebook()], documents: [chain({ data: null, error: null })] }),
      );
      await expect(service.rename('user-1', 'nb-1', 'missing', { label: 'x' })).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });
});
