import { Injectable, ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import * as moment from 'moment';

/** Ce que le POST /documents/url récupère en SYNCHRONE (titre pour `name`, defaultLanguage pour Supadata). */
export interface VideoDetails {
  title: string | null;
  durationSeconds: number;
  defaultLanguage: string | undefined;
}

/**
 * Appel externe DANS le chemin de requête → timeout court obligatoire : si l'API YouTube
 * rame, le POST /url ne doit pas pendre pour tout le monde.
 */
const METADATA_TIMEOUT_MS = 4000;

/**
 * Métadonnées YouTube (Data API v3) — même appel que `video.service.ts:99-124`, mais avec
 * timeout et une taxonomie d'erreurs en deux cas distincts :
 *  - vidéo introuvable/privée (réponse claire de l'API) → 422 `VIDEO_UNAVAILABLE`, PERMANENT,
 *    l'utilisateur ne doit pas réessayer ;
 *  - API injoignable / timeout / clé refusée → 503 `UPSTREAM_UNAVAILABLE`, TRANSITOIRE,
 *    l'utilisateur peut réessayer.
 * `GOOGLE_YOUTUBE_API_KEY` non requise au boot (philosophie socle) : absence → 503 à l'usage.
 */
@Injectable()
export class YoutubeMetadataService {
  async getVideoDetails(videoId: string): Promise<VideoDetails> {
    const apiKey = process.env.GOOGLE_YOUTUBE_API_KEY;
    if (!apiKey) {
      throw new ServiceUnavailableException({
        message: 'YouTube metadata is not configured',
        code: 'UPSTREAM_UNAVAILABLE',
      });
    }

    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${apiKey}&part=snippet,contentDetails`;
    let res: Response;
    try {
      res = await fetch(apiUrl, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(METADATA_TIMEOUT_MS),
      });
    } catch {
      throw new ServiceUnavailableException({
        message: 'YouTube API is unreachable, please retry',
        code: 'UPSTREAM_UNAVAILABLE',
      });
    }
    if (!res.ok) {
      throw new ServiceUnavailableException({
        message: `YouTube API error (HTTP ${res.status}), please retry`,
        code: 'UPSTREAM_UNAVAILABLE',
      });
    }

    const data = (await res.json()) as {
      items?: [{ snippet?: { title?: string; defaultLanguage?: string }; contentDetails?: { duration?: string } }];
    };
    const item = data?.items?.[0];
    if (!item) {
      throw new UnprocessableEntityException({
        message: 'This video is unavailable (private, deleted or wrong id)',
        code: 'VIDEO_UNAVAILABLE',
      });
    }

    return {
      title: item.snippet?.title ?? null,
      // Durée ISO 8601 → secondes, comme le legacy (video.service.ts:121, via moment).
      durationSeconds: moment.duration(item.contentDetails?.duration || 0).asSeconds(),
      defaultLanguage: item.snippet?.defaultLanguage,
    };
  }
}
