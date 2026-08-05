import { Module } from '@nestjs/common';
import { DocumentStorageService } from './document-storage.service';

/**
 * Module dédié au stockage S3 des documents : importé par `NotebookDocumentsModule` (upload)
 * ET par `DocumentIngestionModule` (retéléchargement dans le worker) — un module partagé
 * plutôt qu'un double provider, et sans créer de cycle (ce module n'importe rien).
 */
@Module({
  providers: [DocumentStorageService],
  exports: [DocumentStorageService],
})
export class DocumentStorageModule {}
