import { Injectable } from '@nestjs/common';
import { WebPDFLoader } from 'langchain/document_loaders/web/pdf';

@Injectable()
export class PdfService {
  public async getPdfChunks(file: any, documentId: any): Promise<{ content: string; page: number; doc_id: string }[]> {
    const fileBlob = new Blob([file.buffer]);
    const loader = new WebPDFLoader(fileBlob, {
      splitPages: true,
      parsedItemSeparator: '',
    });
    const pages = await loader.load();
    const pagesNormalized = this.normalizePages(pages, documentId);

    console.log('[PDF] Loaded', pages?.length, 'pages');

    return pagesNormalized;
  }

  private async normalizePages(pages, documentId: any) {
    return pages.map((page: any) => {
      if (typeof page.pageContent === 'string') {
        return {
          content: page.pageContent.replaceAll('\n', ' ').replace(/\0/g, "").replace(/[^\P{C}\n\t]/gu, ""), // remove NULL bytes and non-printable control chars except newline/tab
          page: page?.metadata?.loc?.pageNumber || 0,
          doc_id: documentId,
        };
      } else if (Array.isArray(page.pageContent)) {
        return {
          content: page.pageContent.join(' ').replace(/\0/g, "").replace(/[^\P{C}\n\t]/gu, ""), // remove NULL bytes and non-printable control chars except newline/tab
          page: page?.metadata?.loc?.pageNumber || 0,
          doc_id: documentId,
        };
      }
    });
  }
}
