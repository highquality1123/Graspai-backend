import { Module } from '@nestjs/common';
import { JobsModule } from '../jobs/jobs.module';
import { NotebookDocumentsController } from './notebook-documents.controller';
import { NotebookDocumentsService } from './notebook-documents.service';
import { DocumentStorageModule } from './storage/document-storage.module';
import { YoutubeMetadataService } from './youtube/youtube-metadata.service';

/**
 * Domaine V2 Documents d'un notebook (routes `/notebooks/:notebookId/documents`).
 * Nommé `notebook-documents` car `documents/` est pris par le module legacy (qui ne bouge pas).
 * Importe `JobsModule` pour `JOB_QUEUE` (déclenchement de l'ingestion asynchrone).
 * Le handler d'ingestion vit dans `./ingestion` (module séparé, branché par `JobsModule`).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  imports: [JobsModule, DocumentStorageModule],
  controllers: [NotebookDocumentsController],
  providers: [NotebookDocumentsService, YoutubeMetadataService],
  exports: [NotebookDocumentsService],
})
export class NotebookDocumentsModule {}
