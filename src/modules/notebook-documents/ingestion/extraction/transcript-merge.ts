import { CoarseChunk } from './extracted-content';

/** Segment de transcript normalisé en SECONDES — Whisper les fournit tels quels ; l'extracteur vidéo convertit les ms Supadata en amont. */
export interface TranscriptSegment {
  start: number;
  end: number;
  text: string;
}

/** Taille de tranche legacy — `audio.service.ts:18` et `video.service.ts:22` (même constante). */
export const CHUNK_DURATION_SECONDS = 30;

/**
 * Fusion des segments en tranches de ~30 s — réplique exacte de `audio.service.ts` mergeChunks
 * (:91-130). L'algorithme vidéo (`video.service.ts` getVideoChunks :226-265) est le MÊME à la
 * conversion ms→s près : après `fixChunksDurations`, `end[i] = start[i+1]`, donc l'accumulation
 * `duration += segment.duration` ≡ `duration += end - start`. Une seule implémentation, fidèle,
 * y compris l'espace final après chaque texte (compat embeddings legacy).
 */
export function mergeTranscriptSegments(segments: TranscriptSegment[]): CoarseChunk[] {
  const merged: CoarseChunk[] = [];
  let content = '';
  let duration = 0;
  let start = 0;
  let end = 0;
  for (const segment of segments) {
    if (duration === 0) {
      start = segment.start;
    }
    end = segment.end;
    content += segment.text + ' ';
    duration += segment.end - segment.start;
    if (duration >= CHUNK_DURATION_SECONDS) {
      merged.push({ content, page: merged.length + 1, duration, start, end });
      content = '';
      duration = 0;
      start = 0;
      end = 0;
    }
  }
  if (duration !== 0) {
    merged.push({ content, page: merged.length + 1, duration, start, end });
  }
  return merged;
}
