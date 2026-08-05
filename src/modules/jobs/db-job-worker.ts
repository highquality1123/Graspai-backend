import { Inject, Injectable, Logger, OnModuleDestroy, OnModuleInit, Optional } from '@nestjs/common';
import { JobContext, JobHandler, JOB_HANDLERS } from './job-handler';
import { JobsService } from './jobs.service';
import { JobRow, ResourceType } from './model/job.types';

/**
 * Worker in-process : poller qui réclame les jobs pending et les dispatche vers le handler
 * du bon resourceType. Gated par `JOBS_WORKER_ENABLED` (permettra un conteneur worker dédié
 * plus tard sans changer le code). Les jobs étant I/O-bound (appels IA), l'event loop n'est pas bloqué.
 */
@Injectable()
export class DbJobWorker implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(DbJobWorker.name);
  private readonly handlers = new Map<ResourceType, JobHandler>();

  private readonly enabled = process.env.JOBS_WORKER_ENABLED !== 'false';
  // Ces vars sont validées au boot par Joi (src/config/validation) : une valeur non numérique
  // fait échouer le démarrage. Le garde ci-dessous est une ceinture+bretelles : même si Joi
  // était retiré un jour, une valeur invalide retombe sur le défaut plutôt qu'en NaN.
  private readonly intervalMs = DbJobWorker.positiveIntOr(process.env.JOBS_POLL_INTERVAL_MS, 2000);
  private readonly concurrency = DbJobWorker.positiveIntOr(process.env.JOBS_CONCURRENCY, 1);
  private readonly maxAttempts = DbJobWorker.positiveIntOr(process.env.JOBS_MAX_ATTEMPTS, 3);

  private static positiveIntOr(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }

  private timer?: ReturnType<typeof setInterval>;
  private busy = false;
  private draining = false;

  constructor(
    private readonly jobs: JobsService,
    @Optional() @Inject(JOB_HANDLERS) handlers: JobHandler[] = [],
  ) {
    for (const handler of handlers ?? []) {
      this.handlers.set(handler.resourceType, handler);
    }
  }

  async onModuleInit(): Promise<void> {
    if (!this.enabled) {
      this.logger.log('Job worker disabled (JOBS_WORKER_ENABLED=false)');
      return;
    }
    const recovered = await this.jobs.recoverOrphans(this.maxAttempts);
    if (recovered.requeued || recovered.failed) {
      this.logger.warn(`Recovered orphans on boot: ${recovered.requeued} requeued, ${recovered.failed} failed`);
    }
    this.timer = setInterval(() => this.tick(), this.intervalMs);
    this.logger.log(`Job worker started (interval=${this.intervalMs}ms, concurrency=${this.concurrency})`);
  }

  onModuleDestroy(): void {
    this.draining = true;
    if (this.timer) clearInterval(this.timer);
  }

  /** Un tick : ignore si le précédent tourne encore (pas de chevauchement). */
  private tick(): void {
    if (this.busy) return;
    this.busy = true;
    this.pollOnce()
      .catch((err) => this.logger.error('Job poll failed', err instanceof Error ? err.stack : String(err)))
      .finally(() => {
        this.busy = false;
      });
  }

  /** Réclame jusqu'à `concurrency` jobs et les traite en parallèle. Exposé pour les tests. */
  async pollOnce(): Promise<void> {
    const running: Promise<void>[] = [];
    while (!this.draining && running.length < this.concurrency) {
      const job = await this.jobs.claimNextJob();
      if (!job) break;
      running.push(this.process(job));
    }
    await Promise.all(running);
  }

  async process(job: JobRow): Promise<void> {
    const handler = this.handlers.get(job.resource_type);
    if (!handler) {
      await this.jobs.markFailed(job.id, `No handler registered for resourceType "${job.resource_type}"`);
      return;
    }
    try {
      const ctx: JobContext = {
        setStage: (stage) => this.jobs.markStage(job.id, stage),
        setProgress: (progress) => this.jobs.markProgress(job.id, progress),
      };
      const { resourceId } = await handler.run(job, ctx);
      await this.jobs.markReady(job.id, resourceId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      if (job.attempts < this.maxAttempts) {
        await this.jobs.requeue(job.id);
        this.logger.warn(`Job ${job.id} failed (attempt ${job.attempts}/${this.maxAttempts}), requeued: ${message}`);
      } else {
        await this.jobs.markFailed(job.id, message);
        this.logger.error(`Job ${job.id} failed permanently: ${message}`);
      }
    }
  }
}
