import { Injectable, Logger } from '@nestjs/common';
import { DOCUMENT_LANGUAGES } from '../../model/document.types';
import { IngestionPayload } from '../document-ingestion.handler';
import { DocumentExtractor } from './document-extractor';
import { ExtractedContent } from './extracted-content';
import { mergeTranscriptSegments, TranscriptSegment } from './transcript-merge';

/** Réponse Supadata (`video.service.ts` → VideoTranscriptResponseDto) : offsets/durations en MILLISECONDES. */
interface SupadataTranscript {
  content?: { text: string; offset: number; duration: number }[];
  lang?: string;
  error?: unknown;
  message?: string;
}

// Au worker (pas dans le chemin de requête) : timeout généreux, le retry ×3 couvre le reste.
const SUPADATA_TIMEOUT_MS = 30_000;

/**
 * Extraction YouTube — transcript Supadata puis fusion 30 s, réplique du chemin legacy
 * `video.service.ts` (getVideoTranscript + fixChunksDurations + getVideoChunks).
 * Détecte la langue du transcript (`detectedLanguage`, persistée par le handler — inconnue
 * au POST /url). Langues : les 8 du contrat (l'en/fr du legacy était un artefact, pas une
 * décision produit — élargi sur go du 18 Jul, support Supadata vérifié ; le norvégien
 * remonte en `no` chez Supadata/YouTube → mappé sur le `nb` du contrat).
 */
@Injectable()
export class YoutubeExtractor implements DocumentExtractor {
  private readonly logger = new Logger(YoutubeExtractor.name);

  async extract(payload: IngestionPayload): Promise<ExtractedContent> {
    if (!payload.videoId) {
      throw new Error(`YouTube extraction requires videoId in the payload (document ${payload.documentId})`);
    }

    const transcript = await this.fetchTranscript(payload.videoId, payload.defaultLanguage);
    if (transcript.error) {
      // Même sémantique que video.service.ts:62-67 : pas de transcript = échec clair.
      throw new Error(transcript.message || 'No transcript is available for this video');
    }
    const detectedLanguage = YoutubeExtractor.toDocumentLanguage(transcript.lang);
    const segments = YoutubeExtractor.toSegments(transcript.content ?? []);

    this.logger.log(`Fetched ${segments.length} transcript segments for document ${payload.documentId}`);
    return { chunks: mergeTranscriptSegments(segments), detectedLanguage };
  }

  private async fetchTranscript(videoId: string, lang: string | undefined): Promise<SupadataTranscript> {
    const apiKey = process.env.SUPADATA_AI_KEY;
    if (!apiKey) {
      throw new Error('SUPADATA_AI_KEY is not configured (YouTube transcript unavailable)');
    }
    let apiUrl = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`;
    if (lang) {
      apiUrl += `&lang=${lang}`;
    }
    const res = await fetch(apiUrl, {
      headers: { 'x-api-key': apiKey },
      signal: AbortSignal.timeout(SUPADATA_TIMEOUT_MS),
    });
    if (!res.ok) {
      throw new Error(`Supadata API Error: HTTP ${res.status}`);
    }
    return (await res.json()) as SupadataTranscript;
  }

  /**
   * Recalage des durées (`fixChunksDurations`, video.service.ts:216-224 — les durées Supadata
   * sont peu fiables : duration[i] = offset[i+1] - offset[i], le dernier garde la sienne),
   * puis conversion ms → secondes vers les segments normalisés de la fusion commune.
   */
  private static toSegments(content: { text: string; offset: number; duration: number }[]): TranscriptSegment[] {
    return content.map((segment, i) => {
      const duration = i < content.length - 1 ? content[i + 1].offset - segment.offset : segment.duration;
      return { start: segment.offset / 1000, end: (segment.offset + duration) / 1000, text: segment.text };
    });
  }

  /** Langue du transcript → code contrat (préfixe, comme le `startsWith` legacy) ; hors liste → échec explicite. */
  private static toDocumentLanguage(lang: string | undefined): string {
    if (lang?.startsWith('no')) return 'nb'; // Supadata/YouTube exposent le norvégien en `no`
    const match = DOCUMENT_LANGUAGES.find((code) => lang?.startsWith(code));
    if (match) return match;
    throw new Error(`Unsupported language of the video (${lang ?? 'unknown'})`);
  }
}
