import { Injectable, Logger, Optional } from '@nestjs/common';
import { WebPDFLoader } from 'langchain/document_loaders/web/pdf';
import { IngestionPayload } from '../document-ingestion.handler';
import { DocumentExtractor } from './document-extractor';
import { CoarseChunk, ExtractedContent } from './extracted-content';

/**
 * Extraction PDF — réplique fidèle de `pdf.service.ts` (getPdfChunks/normalizePages) :
 * même lib (WebPDFLoader langchain), mêmes options, 1 chunk par page, même nettoyage
 * (NULL bytes + caractères de contrôle non imprimables sauf \n\t). Seul ajout : un
 * contenu ni string ni array retombe sur '' au lieu de produire un trou (durci, sans
 * incidence — pdf.js ne produit pas ce cas).
 */
/** Signature de l'option `pdfjs` de WebPDFLoader (langchain pdf.cjs → PDFLoaderImports). */
type PdfJsImport = () => Promise<{ getDocument: unknown; version: unknown }>;

@Injectable()
export class PdfExtractor implements DocumentExtractor {
  private readonly logger = new Logger(PdfExtractor.name);

  // Injectable pour les tests uniquement : jest ne supporte pas l'import dynamique interne
  // de WebPDFLoader (--experimental-vm-modules). En prod, undefined → import par défaut.
  // @Optional : aucun provider Nest ne fournit ce paramètre, le DI doit injecter undefined.
  constructor(@Optional() private readonly pdfjs?: PdfJsImport) {}

  async extract(payload: IngestionPayload, file: Buffer | null): Promise<ExtractedContent> {
    if (!file) {
      throw new Error(`PDF extraction requires the S3 file buffer (document ${payload.documentId})`);
    }

    const loader = new WebPDFLoader(new Blob([file]), {
      splitPages: true,
      parsedItemSeparator: '',
      pdfjs: this.pdfjs as never,
    });
    const pages = await loader.load();
    this.logger.log(`Loaded ${pages?.length ?? 0} pages for document ${payload.documentId}`);

    const chunks: CoarseChunk[] = pages.map((page) => ({
      content: PdfExtractor.normalizeContent(page.pageContent),
      page: (page?.metadata as { loc?: { pageNumber?: number } })?.loc?.pageNumber || 0,
    }));
    return { chunks };
  }

  /** Nettoyage copié de `pdf.service.ts:24,30` (branches string et array du legacy). */
  private static normalizeContent(pageContent: unknown): string {
    if (typeof pageContent === 'string') {
      return pageContent
        .replaceAll('\n', ' ')
        .replace(/\0/g, '')
        .replace(/[^\P{C}\n\t]/gu, '');
    }
    if (Array.isArray(pageContent)) {
      return pageContent
        .join(' ')
        .replace(/\0/g, '')
        .replace(/[^\P{C}\n\t]/gu, '');
    }
    return '';
  }
}
