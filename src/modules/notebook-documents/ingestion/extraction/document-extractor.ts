import { IngestionPayload } from '../document-ingestion.handler';
import { ExtractedContent } from './extracted-content';

/**
 * Un extracteur par `kind` (stage `transcribing`). Pas de token DI : le handler tient un
 * simple map kind → extracteur (le token est réservé à la frontière RAG, `DOCUMENT_INDEXER`).
 * `file` : buffer retéléchargé depuis S3 — null pour les kinds sans fichier (video/YouTube).
 */
export interface DocumentExtractor {
  extract(payload: IngestionPayload, file: Buffer | null): Promise<ExtractedContent>;
}
