import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { NotebookSummariesController } from './notebook-summaries.controller';
import { NotebookSummariesService } from './notebook-summaries.service';

/**
 * Domaine V2 Summaries d'un notebook (routes `/notebooks/:notebookId/summaries`).
 * Nommé `notebook-summaries` par uniformité de famille avec `notebook-documents`.
 * Importe `JobsModule` pour `JOB_QUEUE` ; le handler de génération vit dans `./generation`
 * (module séparé, branché par `JobsModule` — même pattern que l'ingestion documents).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  imports: [JobsModule],
  controllers: [NotebookSummariesController],
  providers: [NotebookSummariesService],
})
export class NotebookSummariesModule {}
