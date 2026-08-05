import { Module } from '@nestjs/common';
import { AiModule } from '../../ai/ai.module';
import { DocumentStorageModule } from '../storage/document-storage.module';
import { DocumentIngestionHandler } from './document-ingestion.handler';
import { AudioExtractor } from './extraction/audio.extractor';
import { PdfExtractor } from './extraction/pdf.extractor';
import { YoutubeExtractor } from './extraction/youtube.extractor';
import { DOCUMENT_INDEXER } from './indexer/document-indexer';
import { LegacyAiIndexer } from './indexer/legacy-ai.indexer';

/**
 * Module AUTONOME du handler d'ingestion, séparé de `NotebookDocumentsModule` à dessein :
 * il est importé par `JobsModule` (qui construit le registre `JOB_HANDLERS`), alors que
 * `NotebookDocumentsModule` importe `JobsModule` pour `JOB_QUEUE` — la séparation évite
 * le cycle d'imports. Il ne doit jamais importer `JobsModule`.
 *
 * ⚠️ `AiModule` (LEGACY) : le SEUL import legacy du V2, confiné ici pour l'adaptateur
 * `LegacyAiIndexer` (frontière RAG, option 3). Il disparaît avec l'adaptateur à la
 * livraison du RAG TS — ne l'importer nulle part ailleurs dans le neuf.
 */
@Module({
  imports: [DocumentStorageModule, AiModule],
  providers: [
    DocumentIngestionHandler,
    PdfExtractor,
    AudioExtractor,
    YoutubeExtractor,
    { provide: DOCUMENT_INDEXER, useClass: LegacyAiIndexer },
  ],
  exports: [DocumentIngestionHandler],
})
export class DocumentIngestionModule {}
