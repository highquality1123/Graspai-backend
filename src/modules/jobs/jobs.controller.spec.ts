import { NotFoundException } from '@nestjs/common';
import { AuthUser } from '../../core/auth/auth-user';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';
import { Job } from './model/job.types';

describe('JobsController', () => {
  const user: AuthUser = { userId: 'user-uuid', email: 'u@graspr.ai' };

  function controllerWith(getForUser: jest.Mock): JobsController {
    return new JobsController({ getForUser } as unknown as JobsService);
  }

  it('returns the Job scoped to the current user', async () => {
    const job: Job = { jobId: 'job-uuid', status: 'ready', resourceType: 'document', resourceId: 'doc-uuid' };
    const getForUser = jest.fn().mockResolvedValue(job);
    const controller = controllerWith(getForUser);

    await expect(controller.getJob(user, 'job-uuid')).resolves.toEqual(job);
    expect(getForUser).toHaveBeenCalledWith('user-uuid', 'job-uuid');
  });

  it('propagates 404 when the job is not owned by the user', async () => {
    const getForUser = jest
      .fn()
      .mockRejectedValue(new NotFoundException({ message: 'Job not found', code: 'NOT_FOUND' }));
    const controller = controllerWith(getForUser);

    await expect(controller.getJob(user, 'someone-elses-job')).rejects.toBeInstanceOf(NotFoundException);
  });
});
