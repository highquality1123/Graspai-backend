import Groq from 'groq-sdk';
import { IngestionPayload } from '../document-ingestion.handler';
import { AudioExtractor } from './audio.extractor';

function payload(overrides: Partial<IngestionPayload> = {}): IngestionPayload {
  return {
    documentId: 'doc-1',
    kind: 'audio',
    language: 'fr',
    url: 'https://bucket.s3.amazonaws.com/key.mp3',
    storageKey: 'key.mp3',
    mimeType: 'audio/mpeg',
    ...overrides,
  };
}

function groqMock(segments: unknown) {
  const create = jest.fn().mockResolvedValue({ segments });
  return { client: { audio: { transcriptions: { create } } } as unknown as Groq, create };
}

describe('AudioExtractor', () => {
  it('transcribes via Groq whisper-large-v3 with the legacy parameters and merges 30s chunks', async () => {
    const { client, create } = groqMock([
      { start: 0, end: 20, text: 'bonjour' },
      { start: 20, end: 35, text: 'le monde' },
    ]);

    const result = await new AudioExtractor(client).extract(payload(), Buffer.from('fake-audio'));

    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        model: 'whisper-large-v3',
        language: 'fr',
        response_format: 'verbose_json',
        timestamp_granularities: ['segment'],
        file: expect.any(File),
      }),
    );
    expect(result.chunks).toEqual([{ content: 'bonjour le monde ', page: 1, duration: 35, start: 0, end: 35 }]);
  });

  it('returns no chunks when the transcription has no segments', async () => {
    const { client } = groqMock(undefined);
    const result = await new AudioExtractor(client).extract(payload(), Buffer.from('x'));
    expect(result.chunks).toEqual([]);
  });

  it('throws when the S3 buffer is missing', async () => {
    const { client } = groqMock([]);
    await expect(new AudioExtractor(client).extract(payload(), null)).rejects.toThrow(/buffer/);
  });

  it('fails cleanly at usage when GROQ_API_KEY is not configured (socle philosophy)', async () => {
    const saved = process.env.GROQ_API_KEY;
    delete process.env.GROQ_API_KEY;
    try {
      await expect(new AudioExtractor().extract(payload(), Buffer.from('x'))).rejects.toThrow(/GROQ_API_KEY/);
    } finally {
      if (saved !== undefined) process.env.GROQ_API_KEY = saved;
    }
  });
});
