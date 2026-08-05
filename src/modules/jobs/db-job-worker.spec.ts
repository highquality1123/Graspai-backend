import { Logger } from '@nestjs/common';
import { DbJobWorker } from './db-job-worker';
import { JobHandler } from './job-handler';
import { JobsService } from './jobs.service';
import { JobRow } from './model/job.types';

beforeAll(() => {
  // Les tests de chemin d'échec loguent volontairement ; on garde la sortie propre.
  jest.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
  jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
});

function jobRow(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-uuid',
    user_id: 'user-uuid',
    status: 'processing',
    stage: null,
    resource_type: 'document',
    resource_id: null,
    progress: null,
    error: null,
    payload: { documentId: 'doc-1' },
    attempts: 1,
    locked_at: '2026-07-07T00:00:00Z',
    created_at: '2026-07-07T00:00:00Z',
    updated_at: '2026-07-07T00:00:00Z',
    ...overrides,
  };
}

function mockJobsService(): jest.Mocked<
  Pick<JobsService, 'claimNextJob' | 'markReady' | 'markFailed' | 'requeue' | 'markStage' | 'markProgress'>
> {
  return {
    claimNextJob: jest.fn(),
    markReady: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
    requeue: jest.fn().mockResolvedValue(undefined),
    markStage: jest.fn().mockResolvedValue(undefined),
    markProgress: jest.fn().mockResolvedValue(undefined),
  } as never;
}

// Handler de démonstration — vit UNIQUEMENT dans ce test. Aucun handler n'est livré en prod.
function demoHandler(impl: JobHandler['run']): JobHandler {
  return { resourceType: 'document', run: jest.fn(impl) };
}

describe('DbJobWorker', () => {
  let jobs: ReturnType<typeof mockJobsService>;

  beforeEach(() => {
    jobs = mockJobsService();
  });

  it('routes a claimed job to its handler and marks it ready with the resourceId', async () => {
    const handler = demoHandler(async () => ({ resourceId: 'doc-uuid' }));
    const worker = new DbJobWorker(jobs as unknown as JobsService, [handler]);
    jobs.claimNextJob.mockResolvedValueOnce(jobRow()).mockResolvedValue(null);

    await worker.pollOnce();

    expect(handler.run).toHaveBeenCalledTimes(1);
    expect(jobs.markReady).toHaveBeenCalledWith('job-uuid', 'doc-uuid');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('exposes setStage/setProgress to the handler', async () => {
    const handler = demoHandler(async (_job, ctx) => {
      await ctx.setStage('chunking');
      await ctx.setProgress(50);
      return { resourceId: 'doc-uuid' };
    });
    const worker = new DbJobWorker(jobs as unknown as JobsService, [handler]);

    await worker.process(jobRow());

    expect(jobs.markStage).toHaveBeenCalledWith('job-uuid', 'chunking');
    expect(jobs.markProgress).toHaveBeenCalledWith('job-uuid', 50);
  });

  it('fails a job whose resourceType has no registered handler', async () => {
    const worker = new DbJobWorker(jobs as unknown as JobsService, []);
    await worker.process(jobRow({ resource_type: 'podcast' }));
    expect(jobs.markFailed).toHaveBeenCalledWith('job-uuid', expect.stringContaining('podcast'));
  });

  it('requeues a failing job while attempts remain', async () => {
    const handler = demoHandler(async () => {
      throw new Error('transient');
    });
    const worker = new DbJobWorker(jobs as unknown as JobsService, [handler]);
    await worker.process(jobRow({ attempts: 1 })); // 1 < 3
    expect(jobs.requeue).toHaveBeenCalledWith('job-uuid');
    expect(jobs.markFailed).not.toHaveBeenCalled();
  });

  it('marks a job failed once attempts are exhausted', async () => {
    const handler = demoHandler(async () => {
      throw new Error('still broken');
    });
    const worker = new DbJobWorker(jobs as unknown as JobsService, [handler]);
    await worker.process(jobRow({ attempts: 3 })); // 3 >= 3
    expect(jobs.markFailed).toHaveBeenCalledWith('job-uuid', 'still broken');
    expect(jobs.requeue).not.toHaveBeenCalled();
  });

  it('drains claimable jobs until the queue is empty', async () => {
    const handler = demoHandler(async () => ({ resourceId: 'doc-uuid' }));
    const worker = new DbJobWorker(jobs as unknown as JobsService, [handler]);
    jobs.claimNextJob.mockResolvedValueOnce(jobRow({ id: 'j1' })).mockResolvedValueOnce(null); // concurrency=1 -> one per pass

    await worker.pollOnce();
    expect(jobs.markReady).toHaveBeenCalledWith('j1', 'doc-uuid');
  });
});
