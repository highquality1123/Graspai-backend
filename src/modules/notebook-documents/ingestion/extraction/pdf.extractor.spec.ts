import { readFileSync } from 'fs';
import { join } from 'path';
import { IngestionPayload } from '../document-ingestion.handler';
import { PdfExtractor } from './pdf.extractor';

// Vraie fixture (2 pages, texte connu) : on teste le VRAI parsing WebPDFLoader, pas un mock.
const FIXTURE = join(__dirname, '..', '..', '..', '..', '..', 'test', 'fixtures', 'sample-2pages.pdf');

function payload(overrides: Partial<IngestionPayload> = {}): IngestionPayload {
  return {
    documentId: 'doc-1',
    kind: 'pdf',
    language: 'en',
    url: 'https://bucket.s3.amazonaws.com/key.pdf',
    storageKey: 'key.pdf',
    mimeType: 'application/pdf',
    ...overrides,
  };
}

// Même module pdfjs que le défaut de WebPDFLoader, chargé en require (jest ne supporte pas
// l'import dynamique du loader sans --experimental-vm-modules). Prod : import par défaut.
const pdfjs = async () => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const mod = require('pdf-parse/lib/pdf.js/v1.10.100/build/pdf.js');
  return { getDocument: mod.getDocument, version: mod.version };
};

describe('PdfExtractor', () => {
  it('extracts one chunk per page with real page numbers (legacy getPdfChunks shape)', async () => {
    const file = readFileSync(FIXTURE);

    const result = await new PdfExtractor(pdfjs).extract(payload(), file);

    expect(result.chunks).toHaveLength(2);
    expect(result.chunks[0]).toEqual({ content: 'Hello from page one', page: 1 });
    expect(result.chunks[1]).toEqual({ content: 'Second page speaks too', page: 2 });
    expect(result.detectedLanguage).toBeUndefined();
  });

  it('applies the legacy sanitization (newlines to spaces, control chars stripped)', () => {
    const normalize = (PdfExtractor as unknown as { normalizeContent: (c: unknown) => string }).normalizeContent.bind(
      PdfExtractor,
    );

    const bel = String.fromCharCode(7);
    const nul = String.fromCharCode(0);
    expect(normalize(`line1${'\n'}line2${bel} end`)).toBe('line1 line2 end'); // \n -> espace, BEL supprimé
    expect(normalize([`a${nul}b`, 'c'])).toBe('ab c'); // branche array : join(' '), NULL bytes supprimés
    expect(normalize(42)).toBe(''); // durcissement V2 (le legacy produirait un trou)
  });

  it('throws when the S3 buffer is missing (worker bug, handled by retry/failed)', async () => {
    await expect(new PdfExtractor().extract(payload(), null)).rejects.toThrow(/buffer/);
  });
});
