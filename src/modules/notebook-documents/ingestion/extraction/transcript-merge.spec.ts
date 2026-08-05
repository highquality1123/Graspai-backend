import { mergeTranscriptSegments } from './transcript-merge';

const seg = (start: number, end: number, text: string) => ({ start, end, text });

describe('mergeTranscriptSegments (réplique de audio.service.ts mergeChunks)', () => {
  it('merges segments into ~30s chunks with 1-based page index and legacy trailing spaces', () => {
    const segments = [
      seg(0, 10, 'a'),
      seg(10, 20, 'b'),
      seg(20, 30, 'c'), // duration atteint exactement 30 -> push (>=)
      seg(30, 40, 'd'), // reliquat
    ];

    const chunks = mergeTranscriptSegments(segments);

    expect(chunks).toEqual([
      { content: 'a b c ', page: 1, duration: 30, start: 0, end: 30 },
      { content: 'd ', page: 2, duration: 10, start: 30, end: 40 },
    ]);
  });

  it('keeps gaps out of duration (duration = somme des segments, pas end - start)', () => {
    // Silence entre 10 et 25 : le legacy additionne les durées de segments, pas l'écart.
    const chunks = mergeTranscriptSegments([seg(0, 10, 'a'), seg(25, 50, 'b')]);

    expect(chunks).toEqual([{ content: 'a b ', page: 1, duration: 35, start: 0, end: 50 }]);
  });

  it('returns no chunk for an empty transcript', () => {
    expect(mergeTranscriptSegments([])).toEqual([]);
  });
});
