import { Module } from '@nestjs/common';
import { DocumentIngestionModule } from '../notebook-documents/ingestion/document-ingestion.module';
import { DocumentIngestionHandler } from '../notebook-documents/ingestion/document-ingestion.handler';
import { SummaryGenerationModule } from '../notebook-summaries/generation/summary-generation.module';
import { SummaryGenerationHandler } from '../notebook-summaries/generation/summary-generation.handler';
import { DbJobQueue } from './db-job-queue';
import { DbJobWorker } from './db-job-worker';
import { JobHandler, JOB_HANDLERS } from './job-handler';
import { JOB_QUEUE } from './job-queue';
import { JobsController } from './jobs.controller';
import { JobsService } from './jobs.service';

/**
 * Infra des jobs asynchrones : `GET /v1/jobs/:jobId` + file d'attente (table `jobs`) + worker.
 * `JOB_QUEUE` est exporté pour que les domaines (documents, summary…) déclenchent des traitements.
 *
 * REGISTRE DES HANDLERS : Nest n'a pas de providers `multi` à la Angular — le registre est
 * construit ICI, explicitement : le module de chaque handler est importé, et le handler ajouté
 * au tableau de la `useFactory` de `JOB_HANDLERS`. Un domaine futur (summary…) s'ajoute d'une
 * ligne dans `imports` + une entrée dans le tableau.
 */
@Module({
  imports: [DocumentIngestionModule, SummaryGenerationModule],
  controllers: [JobsController],
  providers: [
    JobsService,
    DbJobWorker,
    { provide: JOB_QUEUE, useClass: DbJobQueue },
    {
      provide: JOB_HANDLERS,
      useFactory: (documents: DocumentIngestionHandler, summaries: SummaryGenerationHandler): JobHandler[] => [
        documents,
        summaries,
      ],
      inject: [DocumentIngestionHandler, SummaryGenerationHandler],
    },
  ],
  exports: [JOB_QUEUE],
})
export class JobsModule {}
