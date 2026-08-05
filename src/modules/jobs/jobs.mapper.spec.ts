import { toJob } from './jobs.mapper';
import { JobRow } from './model/job.types';

function row(overrides: Partial<JobRow> = {}): JobRow {
  return {
    id: 'job-uuid',
    user_id: 'user-uuid',
    status: 'pending',
    stage: null,
    resource_type: 'document',
    resource_id: null,
    progress: null,
    error: null,
    payload: null,
    attempts: 0,
    locked_at: null,
    created_at: '2026-07-07T00:00:00Z',
    updated_at: '2026-07-07T00:00:00Z',
    ...overrides,
  };
}

describe('toJob', () => {
  it('maps only the required fields for a pending job', () => {
    expect(toJob(row())).toEqual({ jobId: 'job-uuid', status: 'pending', resourceType: 'document' });
  });

  it('exposes stage while processing', () => {
    expect(toJob(row({ status: 'processing', stage: 'chunking', progress: 40 }))).toEqual({
      jobId: 'job-uuid',
      status: 'processing',
      resourceType: 'document',
      stage: 'chunking',
      progress: 40,
    });
  });

  it('exposes resourceId when ready', () => {
    const job = toJob(row({ status: 'ready', resource_id: 'doc-uuid', progress: 100 }));
    expect(job).toEqual({
      jobId: 'job-uuid',
      status: 'ready',
      resourceType: 'document',
      resourceId: 'doc-uuid',
      progress: 100,
    });
  });

  it('exposes error when failed', () => {
    const job = toJob(row({ status: 'failed', error: 'boom' }));
    expect(job).toEqual({ jobId: 'job-uuid', status: 'failed', resourceType: 'document', error: 'boom' });
  });

  it('never leaks internal columns', () => {
    const job = toJob(row({ payload: { secret: 1 }, user_id: 'user-uuid', attempts: 2 }));
    expect(job).not.toHaveProperty('payload');
    expect(job).not.toHaveProperty('user_id');
    expect(job).not.toHaveProperty('attempts');
  });
});
