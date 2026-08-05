import { IngestionPayload } from '../document-ingestion.handler';
import { YoutubeExtractor } from './youtube.extractor';

function payload(overrides: Partial<IngestionPayload> = {}): IngestionPayload {
  return {
    documentId: 'doc-1',
    kind: 'video',
    language: 'en',
    url: 'https://youtu.be/dQw4w9WgXcQ',
    videoId: 'dQw4w9WgXcQ',
    defaultLanguage: 'en',
    ...overrides,
  };
}

function fetchMock(body: unknown, ok = true, status = 200) {
  const impl = jest.fn().mockResolvedValue({ ok, status, json: async () => body } as unknown as Response);
  global.fetch = impl as unknown as typeof fetch;
  return impl;
}

describe('YoutubeExtractor', () => {
  const saved = process.env.SUPADATA_AI_KEY;
  beforeEach(() => {
    process.env.SUPADATA_AI_KEY = 'test-key';
  });
  afterAll(() => {
    if (saved !== undefined) process.env.SUPADATA_AI_KEY = saved;
    else delete process.env.SUPADATA_AI_KEY;
  });

  it('fixes Supadata durations (offset diff), converts ms to seconds and merges 30s chunks', async () => {
    // Durées Supadata volontairement fausses : le recalage legacy duration[i] = offset[i+1]-offset[i]
    // doit les corriger (le dernier segment garde la sienne).
    fetchMock({
      lang: 'en',
      content: [
        { text: 'one', offset: 0, duration: 999_999 },
        { text: 'two', offset: 20_000, duration: 999_999 },
        { text: 'three', offset: 40_000, duration: 15_000 },
      ],
    });

    const result = await new YoutubeExtractor().extract(payload());

    expect(result.detectedLanguage).toBe('en');
    expect(result.chunks).toEqual([
      { content: 'one two ', page: 1, duration: 40, start: 0, end: 40 },
      { content: 'three ', page: 2, duration: 15, start: 40, end: 55 },
    ]);
  });

  it('passes the defaultLanguage from the payload to Supadata (legacy behaviour)', async () => {
    const impl = fetchMock({ lang: 'fr', content: [] });

    const result = await new YoutubeExtractor().extract(payload({ defaultLanguage: 'fr' }));

    expect(impl).toHaveBeenCalledWith(expect.stringContaining('lang=fr'), expect.anything());
    expect(result.detectedLanguage).toBe('fr');
  });

  it('throws when Supadata reports no transcript (video.service.ts:62-67 semantics)', async () => {
    fetchMock({ error: 'transcript-unavailable', message: 'No transcript is available for this video' });
    await expect(new YoutubeExtractor().extract(payload())).rejects.toThrow(/No transcript/);
  });

  it('accepts all 8 contract languages, mapping Norwegian no -> nb', async () => {
    fetchMock({ lang: 'de', content: [] });
    await expect(new YoutubeExtractor().extract(payload())).resolves.toMatchObject({ detectedLanguage: 'de' });

    fetchMock({ lang: 'no', content: [] });
    await expect(new YoutubeExtractor().extract(payload())).resolves.toMatchObject({ detectedLanguage: 'nb' });
  });

  it('throws on a transcript language outside the contract list', async () => {
    fetchMock({ lang: 'ja', content: [{ text: 'こんにちは', offset: 0, duration: 1000 }] });
    await expect(new YoutubeExtractor().extract(payload())).rejects.toThrow(/Unsupported language/);
  });

  it('throws when videoId is missing from the payload', async () => {
    await expect(new YoutubeExtractor().extract(payload({ videoId: undefined }))).rejects.toThrow(/videoId/);
  });
});
