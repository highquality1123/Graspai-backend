import { Injectable, Logger, Optional } from '@nestjs/common';
import Groq from 'groq-sdk';
import { IngestionPayload } from '../document-ingestion.handler';
import { DocumentExtractor } from './document-extractor';
import { ExtractedContent } from './extracted-content';
import { mergeTranscriptSegments, TranscriptSegment } from './transcript-merge';

/** Modèle et paramètres copiés de `ai.service.ts:28,210-220` (transcribeAudioFile). */
const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3';

/**
 * Extraction audio — transcription Groq Whisper (segments timestampés) puis fusion en
 * tranches de 30 s, comme le chemin legacy `audio.service.ts` transcribeAndGetAudioChunks.
 * `GROQ_API_KEY` n'est pas requise au boot (philosophie socle) : échec propre à l'usage.
 */
@Injectable()
export class AudioExtractor implements DocumentExtractor {
  private readonly logger = new Logger(AudioExtractor.name);
  private client?: Groq;

  // Client injectable pour les tests uniquement ; en prod, instancié depuis l'env à l'usage.
  // @Optional : aucun provider Nest ne fournit Groq, le DI doit injecter undefined.
  constructor(@Optional() groq?: Groq) {
    this.client = groq;
  }

  async extract(payload: IngestionPayload, file: Buffer | null): Promise<ExtractedContent> {
    if (!file) {
      throw new Error(`Audio extraction requires the S3 file buffer (document ${payload.documentId})`);
    }

    const audioFile = new File([new Blob([file])], payload.storageKey ?? 'audio', {
      type: payload.mimeType ?? 'audio/mpeg',
    });
    const transcription = await this.getClient().audio.transcriptions.create({
      file: audioFile,
      model: GROQ_TRANSCRIPTION_MODEL,
      language: payload.language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    const segments = (transcription as unknown as { segments?: TranscriptSegment[] }).segments ?? [];
    this.logger.log(`Transcribed ${segments.length} segments for document ${payload.documentId}`);
    return { chunks: mergeTranscriptSegments(segments) };
  }

  private getClient(): Groq {
    if (!this.client) {
      if (!process.env.GROQ_API_KEY) {
        throw new Error('GROQ_API_KEY is not configured (audio transcription unavailable)');
      }
      this.client = new Groq({ apiKey: process.env.GROQ_API_KEY });
    }
    return this.client;
  }
}
