import {
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { JOB_QUEUE, JobQueue } from '../jobs/job-queue';
import { SupabaseService } from '../supabase/supabase.service';
import { IngestionPayload } from './ingestion/document-ingestion.handler';
import {
  DocumentJobAccepted,
  DocumentKind,
  DocumentRow,
  NotebookDocument,
  UPLOADABLE_KINDS,
} from './model/document.types';
import { IngestUrlDto } from './model/ingest-url.dto';
import { UpdateDocumentDto } from './model/update-document.dto';
import { UploadDocumentDto } from './model/upload-document.dto';
import { toNotebookDocument } from './notebook-documents.mapper';
import { DocumentStorageService } from './storage/document-storage.service';
import { YoutubeMetadataService } from './youtube/youtube-metadata.service';
import { extractVideoId } from './youtube/youtube';

// Colonnes lues (jamais user_id) + statut du job d'ingestion embarqué via la FK `ingest_job_id` (migration 008).
const DOCUMENT_SELECT =
  'id, name, type, language, url, container_id, ingest_job_id, created_at, ingest_job:ingest_job_id (status)';

// Whitelist MIME copiée du legacy (`documents.service.ts` → `validateDocument`, jamais appelée
// là-bas) — appliquée pour de vrai ici. La limite audio 25 Mo est une contrainte de transcription.
const PDF_MIME_TYPES = ['application/pdf'];
const AUDIO_MIME_TYPES = [
  'audio/flac',
  'audio/x-flac',
  'audio/m4a',
  'audio/x-m4a',
  'audio/mp4',
  'video/mp4',
  'audio/mpeg',
  'audio/x-mpegurl',
  'video/mpeg',
  'audio/ogg',
  'video/ogg',
  'application/ogg',
  'audio/x-opus+ogg',
  'audio/wav',
  'audio/x-wav',
  'audio/webm',
  'video/webm',
];
const AUDIO_MAX_BYTES = 25 * 1024 * 1024;

/**
 * Documents V2 d'un notebook — cycle de vie (upload → S3 → ligne `documents` → job d'ingestion).
 * Scoping par `user_id` fait ICI (client service-role) : 404 si absent ou non-possédé.
 * Le statut d'ingestion vit dans la table `jobs` (une seule source de vérité, FK `ingest_job_id`) ;
 * un document sans job (legacy) est `ready`. Pas de DELETE en v1 (blast radius — v2-socle-debt.md §5).
 */
@Injectable()
export class NotebookDocumentsService {
  private readonly logger = new Logger(NotebookDocumentsService.name);
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  // Garde-fou INFRA, pas règle produit : l'extraction PDF (goal 2) est en mémoire et le worker
  // partage le conteneur avec l'API (EB mono-conteneur) — un PDF énorme = OOM qui emporte tout.
  // Validée au boot par Joi ; le fallback couvre un retrait futur de la validation.
  private readonly pdfMaxMb = NotebookDocumentsService.positiveIntOr(process.env.DOCUMENTS_PDF_MAX_SIZE_MB, 100);

  private static positiveIntOr(value: string | undefined, fallback: number): number {
    const n = Number(value);
    return Number.isInteger(n) && n > 0 ? n : fallback;
  }

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly storage: DocumentStorageService,
    private readonly youtube: YoutubeMetadataService,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
  ) {}

  async list(userId: string, notebookId: string): Promise<NotebookDocument[]> {
    await this.assertNotebookOwned(userId, notebookId);
    const { data, error } = await this.supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as unknown as DocumentRow[]).map(toNotebookDocument);
  }

  async upload(
    userId: string,
    notebookId: string,
    file: Express.Multer.File | undefined,
    dto: UploadDocumentDto,
  ): Promise<DocumentJobAccepted> {
    await this.assertNotebookOwned(userId, notebookId);
    if (!file) {
      throw new UnprocessableEntityException({ message: 'file is required', code: 'VALIDATION_FAILED' });
    }
    this.validateFile(file, dto.kind);

    const language = dto.language ?? 'en';
    const storageKey = this.buildStorageKey(file.originalname);
    const url = await this.storage.put(storageKey, file.buffer, file.mimetype);

    const documentId = uuidv4();
    const { error: insertError } = await this.supabase.from('documents').insert({
      id: documentId,
      user_id: userId,
      container_id: notebookId,
      name: dto.label ?? file.originalname,
      type: dto.kind,
      language,
      url,
    });
    if (insertError) {
      await this.compensate({ storageKey });
      throw new InternalServerErrorException(insertError.message);
    }

    const payload: IngestionPayload = {
      documentId,
      kind: dto.kind,
      language,
      url,
      storageKey,
      mimeType: file.mimetype,
    };
    return this.enqueueAndLink(userId, documentId, payload, storageKey);
  }

  /**
   * POST …/documents/url — YouTube en v1 (page web au goal 5 → 422 UNSUPPORTED_URL provisoire).
   * Métadonnées récupérées en SYNCHRONE (titre → `name` ; échec immédiat plutôt qu'un job qui
   * échouera : 422 VIDEO_UNAVAILABLE permanent vs 503 UPSTREAM_UNAVAILABLE transitoire, timeout
   * court dans YoutubeMetadataService). Le transcript, lui, part au worker. `language` est
   * provisoire ('en') : détectée du transcript et persistée par le handler.
   */
  async ingestUrl(userId: string, notebookId: string, dto: IngestUrlDto): Promise<DocumentJobAccepted> {
    await this.assertNotebookOwned(userId, notebookId);
    const videoId = extractVideoId(dto.url);
    if (!videoId) {
      throw new UnprocessableEntityException({
        message: 'Only YouTube URLs are supported for now — web page ingestion is not available yet',
        code: 'UNSUPPORTED_URL',
      });
    }
    const details = await this.youtube.getVideoDetails(videoId);

    const documentId = uuidv4();
    const { error: insertError } = await this.supabase.from('documents').insert({
      id: documentId,
      user_id: userId,
      container_id: notebookId,
      name: details.title ?? 'YouTube Video', // fallback legacy (video.service.ts:56-59)
      type: 'video',
      language: 'en',
      url: dto.url,
    });
    if (insertError) throw new InternalServerErrorException(insertError.message);

    const payload: IngestionPayload = {
      documentId,
      kind: 'video',
      language: 'en',
      url: dto.url,
      videoId,
      defaultLanguage: details.defaultLanguage,
      durationSeconds: details.durationSeconds,
    };
    return this.enqueueAndLink(userId, documentId, payload);
  }

  async rename(
    userId: string,
    notebookId: string,
    documentId: string,
    dto: UpdateDocumentDto,
  ): Promise<NotebookDocument> {
    await this.assertNotebookOwned(userId, notebookId);
    await this.assertDocumentOwned(userId, notebookId, documentId);
    const { data, error } = await this.supabase
      .from('documents')
      .update({ name: dto.label })
      .eq('id', documentId)
      .eq('container_id', notebookId)
      .eq('user_id', userId) // defense-in-depth : re-scope l'écriture, en plus du check de propriété
      .select(DOCUMENT_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toNotebookDocument(data as unknown as DocumentRow);
  }

  /**
   * DELETE /notebooks/:id/documents/:documentId — suppression IRRÉVERSIBLE (204).
   * Scoping user_id → 404 (jamais 403). Supprime la ligne `documents` : les cascades DB
   * emportent embeddings, chapters, chats, quizzes, flashcards_sets, generated_videos ; les
   * NOTES sont DÉLINKÉES (document_id → NULL, migration 015), pas détruites. L'objet S3 est
   * supprimé best-effort (comme la compensation d'upload) — sans masquer une erreur d'origine ;
   * un document vidéo (url YouTube) n'a pas d'objet S3, keyFromUrl renvoie null.
   */
  async remove(userId: string, notebookId: string, documentId: string): Promise<void> {
    const row = await this.getOwnedDocument(userId, notebookId, documentId);

    const { error } = await this.supabase
      .from('documents')
      .delete()
      .eq('id', documentId)
      .eq('container_id', notebookId)
      .eq('user_id', userId); // defense-in-depth : re-scope l'écriture, en plus du check de propriété
    if (error) throw new InternalServerErrorException(error.message);

    const storageKey = this.storage.keyFromUrl(row.url);
    if (storageKey) {
      try {
        await this.storage.delete(storageKey);
      } catch (err) {
        this.logger.error(
          `Document ${documentId} deleted, but its S3 object ${storageKey} could not be removed`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }

  // ── privé ────────────────────────────────────────────────────────────────

  private async assertNotebookOwned(userId: string, notebookId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('containers')
      .select('id')
      .eq('id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Notebook not found', code: 'NOT_FOUND' });
  }

  private async assertDocumentOwned(userId: string, notebookId: string, documentId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Document not found', code: 'NOT_FOUND' });
  }

  /** Check de propriété qui retourne la ligne (id + url) — le delete a besoin de l'url pour l'objet S3. */
  private async getOwnedDocument(
    userId: string,
    notebookId: string,
    documentId: string,
  ): Promise<{ id: string; url: string | null }> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('id, url')
      .eq('id', documentId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Document not found', code: 'NOT_FOUND' });
    return data as { id: string; url: string | null };
  }

  private validateFile(file: Express.Multer.File, kind: DocumentKind): void {
    if (!UPLOADABLE_KINDS.includes(kind)) {
      throw new UnprocessableEntityException({
        message: `Kind "${kind}" cannot be uploaded as a file — videos go through POST …/documents/url`,
        code: 'UNSUPPORTED_KIND',
      });
    }
    if (kind === 'pdf') {
      if (!PDF_MIME_TYPES.includes(file.mimetype)) {
        throw new UnprocessableEntityException({ message: 'Only PDF files are allowed', code: 'INVALID_FILE_TYPE' });
      }
      if (file.size > this.pdfMaxMb * 1024 * 1024) {
        throw new UnprocessableEntityException({
          message: `PDF files only up to ${this.pdfMaxMb}Mb are supported`,
          code: 'FILE_TOO_LARGE',
        });
      }
      return;
    }
    if (!AUDIO_MIME_TYPES.includes(file.mimetype)) {
      throw new UnprocessableEntityException({
        message: 'Only flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav or webm files are allowed',
        code: 'INVALID_FILE_TYPE',
      });
    }
    if (file.size >= AUDIO_MAX_BYTES) {
      throw new UnprocessableEntityException({
        message: 'Audio files only up to 25Mb are supported',
        code: 'FILE_TOO_LARGE',
      });
    }
  }

  /** Clé S3 opaque (uuid + extension d'origine si saine) — jamais le nom fourni par l'utilisateur. */
  private buildStorageKey(originalName: string): string {
    const match = /\.([a-z0-9]{1,8})$/i.exec(originalName ?? '');
    return match ? `${uuidv4()}.${match[1].toLowerCase()}` : uuidv4();
  }

  /** Enqueue + lien `ingest_job_id`, avec compensation commune aux deux chemins (fichier et URL). */
  private async enqueueAndLink(
    userId: string,
    documentId: string,
    payload: IngestionPayload,
    storageKey?: string,
  ): Promise<DocumentJobAccepted> {
    try {
      const { jobId, estimatedSeconds } = await this.jobQueue.enqueue(userId, { resourceType: 'document', payload });
      const { error: linkError } = await this.supabase
        .from('documents')
        .update({ ingest_job_id: jobId })
        .eq('id', documentId)
        .eq('user_id', userId);
      if (linkError) throw new Error(linkError.message);
      return { jobId, estimatedSeconds, documentId };
    } catch (err) {
      // Compensation : sans job lié, le document s'afficherait `ready` sans jamais être ingéré.
      await this.compensate({ storageKey, documentId });
      throw new InternalServerErrorException(err instanceof Error ? err.message : String(err));
    }
  }

  /** Nettoyage best-effort après échec à mi-parcours — ne masque jamais l'erreur d'origine. */
  private async compensate(target: { storageKey?: string; documentId?: string }): Promise<void> {
    if (target.documentId) {
      const { error } = await this.supabase.from('documents').delete().eq('id', target.documentId);
      if (error) {
        this.logger.error(`Compensation failed: could not delete document ${target.documentId}: ${error.message}`);
      }
    }
    if (target.storageKey) {
      try {
        await this.storage.delete(target.storageKey);
      } catch (err) {
        this.logger.error(
          `Compensation failed: could not delete S3 object ${target.storageKey}`,
          err instanceof Error ? err.stack : String(err),
        );
      }
    }
  }
}
