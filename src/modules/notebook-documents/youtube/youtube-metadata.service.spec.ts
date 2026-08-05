import { ServiceUnavailableException, UnprocessableEntityException } from '@nestjs/common';
import { YoutubeMetadataService } from './youtube-metadata.service';
import { extractVideoId } from './youtube';

function fetchMock(impl: jest.Mock) {
  global.fetch = impl as unknown as typeof fetch;
}

const okResponse = (items: unknown[]) => ({ ok: true, json: async () => ({ items }) }) as unknown as Response;

describe('extractVideoId (regex legacy video.service.ts:92-97)', () => {
  it('extracts the id from the usual YouTube url shapes', () => {
    expect(extractVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtu.be/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
    expect(extractVideoId('https://youtube.com/embed/dQw4w9WgXcQ')).toBe('dQw4w9WgXcQ');
  });

  it('returns null for anything that is not a YouTube video url', () => {
    expect(extractVideoId('https://example.com/article')).toBeNull();
    expect(extractVideoId('https://www.youtube.com/watch')).toBeNull();
  });
});

describe('YoutubeMetadataService', () => {
  const saved = process.env.GOOGLE_YOUTUBE_API_KEY;
  beforeEach(() => {
    process.env.GOOGLE_YOUTUBE_API_KEY = 'test-key';
  });
  afterAll(() => {
    if (saved !== undefined) process.env.GOOGLE_YOUTUBE_API_KEY = saved;
    else delete process.env.GOOGLE_YOUTUBE_API_KEY;
  });

  it('returns title, duration in seconds (ISO 8601) and defaultLanguage', async () => {
    fetchMock(
      jest
        .fn()
        .mockResolvedValue(
          okResponse([
            { snippet: { title: 'Ma vidéo', defaultLanguage: 'fr' }, contentDetails: { duration: 'PT1M30S' } },
          ]),
        ),
    );

    const details = await new YoutubeMetadataService().getVideoDetails('dQw4w9WgXcQ');

    expect(details).toEqual({ title: 'Ma vidéo', durationSeconds: 90, defaultLanguage: 'fr' });
  });

  it('maps an unavailable video (empty items) to a PERMANENT 422 VIDEO_UNAVAILABLE', async () => {
    fetchMock(jest.fn().mockResolvedValue(okResponse([])));

    await expect(new YoutubeMetadataService().getVideoDetails('gone')).rejects.toMatchObject({
      constructor: UnprocessableEntityException,
      response: { code: 'VIDEO_UNAVAILABLE' },
    });
  });

  it('maps network errors and timeouts to a TRANSIENT 503 UPSTREAM_UNAVAILABLE', async () => {
    fetchMock(jest.fn().mockRejectedValue(new Error('socket hang up')));
    await expect(new YoutubeMetadataService().getVideoDetails('x')).rejects.toMatchObject({
      constructor: ServiceUnavailableException,
      response: { code: 'UPSTREAM_UNAVAILABLE' },
    });

    fetchMock(jest.fn().mockResolvedValue({ ok: false, status: 500 } as unknown as Response));
    await expect(new YoutubeMetadataService().getVideoDetails('x')).rejects.toMatchObject({
      response: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });

  it('fails cleanly at usage when the API key is not configured (socle philosophy)', async () => {
    delete process.env.GOOGLE_YOUTUBE_API_KEY;
    await expect(new YoutubeMetadataService().getVideoDetails('x')).rejects.toMatchObject({
      response: { code: 'UPSTREAM_UNAVAILABLE' },
    });
  });
});
