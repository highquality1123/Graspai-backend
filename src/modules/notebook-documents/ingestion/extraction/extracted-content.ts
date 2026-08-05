/**
 * FRONTIÈRE extraction → indexation (goal 2 → goal 3).
 *
 * Calqué sur ce que produisent les callbacks `getDocumentChunks` du legacy
 * (`pdf.service.ts` getPdfChunks · `audio.service.ts` mergeChunks · `video.service.ts`
 * getVideoChunks) : chunks grossiers 1/page (pdf) ou par tranche de 30 s (audio/vidéo).
 * Le mapping du goal 3 vers `AiService.buildEmbeddings` ({content, doc_id, page, duration,
 * start, end}) est ainsi une traduction triviale — seule différence : `doc_id` est ajouté
 * par l'adaptateur, pas ici.
 */
export interface CoarseChunk {
  content: string;
  /** PDF : numéro de page réel ; audio/vidéo : index de tranche 30 s (1-based), comme le legacy. */
  page: number;
  /** Secondes — présents pour audio/vidéo uniquement. */
  duration?: number;
  start?: number;
  end?: number;
}

export interface ExtractedContent {
  chunks: CoarseChunk[];
  /**
   * Langue détectée pendant l'extraction (vidéo : `lang` du transcript Supadata) — le
   * handler la persiste sur `documents.language` (inconnue au moment du POST /url).
   */
  detectedLanguage?: string;
}
