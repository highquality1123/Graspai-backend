import { Inject, Injectable, Logger } from '@nestjs/common';
import { JobContext, JobHandler } from '../../jobs/job-handler';
import { JobRow } from '../../jobs/model/job.types';
import { SupabaseService } from '../../supabase/supabase.service';
import { DocumentStorageService } from '../storage/document-storage.service';
import { AudioExtractor } from './extraction/audio.extractor';
import { DocumentExtractor } from './extraction/document-extractor';
import { ExtractedContent } from './extraction/extracted-content';
import { PdfExtractor } from './extraction/pdf.extractor';
import { YoutubeExtractor } from './extraction/youtube.extractor';
import { DOCUMENT_INDEXER, DocumentIndexer } from './indexer/document-indexer';

/**
 * Entrées du job d'ingestion, posées par `NotebookDocumentsService` dans `jobs.payload`.
 * Upload fichier (pdf/audio) : `storageKey` + `mimeType` — le worker retélécharge depuis S3
 * (le buffer multer n'existe plus). URL YouTube (video) : `videoId` + `defaultLanguage`
 * (métadonnées déjà récupérées en synchrone au POST, pas de fichier S3).
 */
export interface IngestionPayload {
  documentId: string;
  kind: string;
  language: string;
  url: string;
  storageKey?: string;
  mimeType?: string;
  videoId?: string;
  defaultLanguage?: string;
  /** Vidéo : durée YouTube (s), écrite dans `documents.length` après index (parité `saveDurationIntoDocumentLength`). */
  durationSeconds?: number;
}

/**
 * Handler d'ingestion des documents (registre `JOB_HANDLERS`) — pipeline complet :
 *
 *  - `transcribing` : retéléchargement S3 (pdf/audio) puis extraction par kind (map
 *    ci-dessous ; la langue détectée par l'extraction vidéo est persistée sur
 *    `documents.language`, inconnue au POST /url) ;
 *  - `chunking` : purge de l'index du document (`indexer.remove`) — IDEMPOTENCE au retry,
 *    sans elle un échec à mi-insert + retry dupliquerait les embeddings (v2-socle-debt.md §6) ;
 *  - `indexing` : `indexer.index` via le token `DOCUMENT_INDEXER` (frontière RAG — impl V1 :
 *    adaptateur du code legacy, compat chat par construction). Les stages sont informatifs :
 *    le découpage fin vit DANS l'indexation legacy, indissociable des embeddings.
 *
 * Échecs (transcript absent, S3/OpenAI injoignables…) : throw → retry ×3 worker → `failed`.
 */
@Injectable()
export class DocumentIngestionHandler implements JobHandler {
  readonly resourceType = 'document' as const;
  private readonly logger = new Logger(DocumentIngestionHandler.name);
  private readonly extractors: Record<string, { extractor: DocumentExtractor; needsFile: boolean }>;

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly storage: DocumentStorageService,
    @Inject(DOCUMENT_INDEXER) private readonly indexer: DocumentIndexer,
    pdf: PdfExtractor,
    audio: AudioExtractor,
    youtube: YoutubeExtractor,
  ) {
    this.extractors = {
      pdf: { extractor: pdf, needsFile: true },
      audio: { extractor: audio, needsFile: true },
      video: { extractor: youtube, needsFile: false },
    };
  }

  async run(job: JobRow, ctx: JobContext): Promise<{ resourceId: string }> {
    const payload = job.payload as Partial<IngestionPayload> | null;
    // Payload invalide = bug d'enqueue, pas une condition métier : on jette, le worker gère retry/failed.
    if (!payload?.documentId) {
      throw new Error(`Ingestion job ${job.id} has no documentId in payload`);
    }
    const entry = this.extractors[payload.kind ?? ''];
    if (!entry) {
      throw new Error(`No extractor for kind "${payload.kind}" (job ${job.id})`);
    }

    await ctx.setStage('transcribing');
    let file: Buffer | null = null;
    if (entry.needsFile) {
      if (!payload.storageKey) {
        throw new Error(`Ingestion job ${job.id} has no storageKey for kind "${payload.kind}"`);
      }
      file = await this.storage.get(payload.storageKey);
    }
    const extracted = await entry.extractor.extract(payload as IngestionPayload, file);
    await this.persistDetectedLanguage(job.user_id, payload as IngestionPayload, extracted);
    await ctx.setProgress(40);

    await ctx.setStage('chunking');
    await this.indexer.remove(payload.documentId);
    await ctx.setProgress(70);

    await ctx.setStage('indexing');
    await this.indexer.index({ id: payload.documentId, userId: job.user_id, kind: payload.kind ?? '' }, extracted);
    await this.persistVideoDuration(job.user_id, payload as IngestionPayload);
    await ctx.setProgress(95);

    this.logger.log(
      `Indexed ${extracted.chunks.length} coarse chunks for document ${payload.documentId} (kind ${payload.kind})`,
    );
    return { resourceId: payload.documentId };
  }

  /** Parité legacy `saveDurationIntoDocumentLength` (video.service.ts:199-214) : length = durée vidéo. */
  private async persistVideoDuration(userId: string, payload: IngestionPayload): Promise<void> {
    if (payload.durationSeconds == null) return;
    const { error } = await this.supabaseService
      .getClient()
      .from('documents')
      .update({ length: payload.durationSeconds })
      .eq('id', payload.documentId)
      .eq('user_id', userId);
    if (error) {
      throw new Error(`Could not persist video duration for document ${payload.documentId}: ${error.message}`);
    }
  }

  /** La langue vidéo n'est connue qu'au transcript : on la pose sur la ligne (re-scopée user_id). */
  private async persistDetectedLanguage(
    userId: string,
    payload: IngestionPayload,
    extracted: ExtractedContent,
  ): Promise<void> {
    if (!extracted.detectedLanguage || extracted.detectedLanguage === payload.language) return;
    const { error } = await this.supabaseService
      .getClient()
      .from('documents')
      .update({ language: extracted.detectedLanguage })
      .eq('id', payload.documentId)
      .eq('user_id', userId);
    if (error) {
      // Non bloquant : la langue est un enrichissement, pas une condition de réussite du job.
      this.logger.error(`Could not persist detected language for document ${payload.documentId}: ${error.message}`);
    }
  }
}
