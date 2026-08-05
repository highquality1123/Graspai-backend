import { Injectable } from '@nestjs/common';
import { EnqueueInput, JobAccepted, JobQueue } from './job-queue';
import { JobsService } from './jobs.service';

/** Implémentation `JobQueue` adossée à la table `jobs`. enqueue = insertion d'un job pending. */
@Injectable()
export class DbJobQueue implements JobQueue {
  constructor(private readonly jobs: JobsService) {}

  enqueue(userId: string, input: EnqueueInput): Promise<JobAccepted> {
    return this.jobs.create(userId, input);
  }
}
