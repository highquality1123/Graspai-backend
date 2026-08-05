import { Module } from '@nestjs/common';
import { SummaryGenerationHandler } from './summary-generation.handler';
import { SummaryGenerator } from './summary-generator';
import { SummarySourceReader } from './summary-source-reader';

/**
 * Module AUTONOME du handler de génération, même pattern que `DocumentIngestionModule` :
 * importé par `JobsModule` (qui construit le registre `JOB_HANDLERS`), alors que
 * `NotebookSummariesModule` importe `JobsModule` pour `JOB_QUEUE` — la séparation évite
 * le cycle d'imports. Il ne doit jamais importer `JobsModule`.
 */
@Module({
  providers: [SummaryGenerationHandler, SummarySourceReader, SummaryGenerator],
  exports: [SummaryGenerationHandler],
})
export class SummaryGenerationModule {}
