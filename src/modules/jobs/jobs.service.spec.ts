import { NotFoundException } from '@nestjs/common';
import { SupabaseService } from '../supabase/supabase.service';
import { JobsService } from './jobs.service';

type Result = { data?: unknown; error?: unknown };

/** Stub chaînable et "thenable" imitant un query builder Supabase, résolvant vers `result`. */
function chain(result: Result) {
  const c: Record<string, unknown> = {};
  ['insert', 'select', 'update', 'delete', 'eq', 'lt', 'gte', 'order', 'limit'].forEach((m) => {
    c[m] = jest.fn(() => c);
  });
  c.single = jest.fn(() => Promise.resolve(result));
  c.maybeSingle = jest.fn(() => Promise.resolve(result));
  c.then = (resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) =>
    Promise.resolve(result).then(resolve, reject);
  return c;
}

function serviceWith(client: { from?: jest.Mock; rpc?: jest.Mock }): JobsService {
  const supabaseService = { getClient: () => client } as unknown as SupabaseService;
  return new JobsService(supabaseService);
}

describe('JobsService', () => {
  describe('create', () => {
    it('inserts a pending job and returns jobId + a provisional estimate', async () => {
      const from = jest.fn(() => chain({ data: { id: 'new-job-uuid' }, error: null }));
      const service = serviceWith({ from });

      const result = await service.create('user-uuid', { resourceType: 'summary' });

      expect(result.jobId).toBe('new-job-uuid');
      expect(result.estimatedSeconds).toBe(30); // provisoire pour 'summary'
      expect(from).toHaveBeenCalledWith('jobs');
    });

    it('honours an explicit estimatedSeconds from the caller', async () => {
      const service = serviceWith({ from: jest.fn(() => chain({ data: { id: 'x' }, error: null })) });
      const result = await service.create('user-uuid', { resourceType: 'document', estimatedSeconds: 999 });
      expect(result.estimatedSeconds).toBe(999);
    });
  });

  describe('getForUser', () => {
    it('returns the mapped Job when found', async () => {
      const dbRow = {
        id: 'job-uuid',
        user_id: 'user-uuid',
        status: 'ready',
        stage: null,
        resource_type: 'quiz',
        resource_id: 'quiz-uuid',
        progress: 100,
        error: null,
      };
      const service = serviceWith({ from: jest.fn(() => chain({ data: dbRow, error: null })) });

      await expect(service.getForUser('user-uuid', 'job-uuid')).resolves.toEqual({
        jobId: 'job-uuid',
        status: 'ready',
        resourceType: 'quiz',
        resourceId: 'quiz-uuid',
        progress: 100,
      });
    });

    it('throws 404 (NOT_FOUND) when the job is absent or not owned', async () => {
      const service = serviceWith({ from: jest.fn(() => chain({ data: null, error: null })) });
      await expect(service.getForUser('user-uuid', 'missing')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('claimNextJob', () => {
    it('returns the first row of the RPC result', async () => {
      const rpc = jest.fn(() => Promise.resolve({ data: [{ id: 'claimed', resource_type: 'document' }], error: null }));
      const service = serviceWith({ rpc });
      const job = await service.claimNextJob();
      expect(job?.id).toBe('claimed');
      expect(rpc).toHaveBeenCalledWith('claim_next_job');
    });

    it('returns null when no job is available', async () => {
      const service = serviceWith({ rpc: jest.fn(() => Promise.resolve({ data: [], error: null })) });
      await expect(service.claimNextJob()).resolves.toBeNull();
    });
  });

  describe('recoverOrphans', () => {
    it('requeues recoverable orphans and fails exhausted ones', async () => {
      const from = jest
        .fn()
        .mockReturnValueOnce(chain({ data: [{ id: 'a' }, { id: 'b' }], error: null })) // requeued
        .mockReturnValueOnce(chain({ data: [{ id: 'c' }], error: null })); // failed
      const service = serviceWith({ from });

      await expect(service.recoverOrphans(3)).resolves.toEqual({ requeued: 2, failed: 1 });
    });
  });
});
