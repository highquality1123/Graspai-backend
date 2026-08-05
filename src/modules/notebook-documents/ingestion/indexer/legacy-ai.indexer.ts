import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { AiService } from '../../../ai/ai.service';
import { DocumentDto } from '../../../documents/model/DocumentDto';
import { DocumentSourceTypeEnum } from '../../../documents/model/DocumentSourceTypeEnum';
import { SupabaseService } from '../../../supabase/supabase.service';
import { ExtractedContent } from '../extraction/extracted-content';
import { DocumentIndexer, IndexableDocument } from './document-indexer';

/** Mapping kind V2 → source legacy (informatif pour buildEmbeddings, qui ne s'en sert que peu). */
const SOURCE_TYPE_BY_KIND: Record<string, DocumentSourceTypeEnum> = {
  pdf: DocumentSourceTypeEnum.FILE,
  audio: DocumentSourceTypeEnum.AUDIO,
  video: DocumentSourceTypeEnum.VIDEO,
};

/**
 * ADAPTATEUR (option 3, actée le 15 Jul) : wrappe `AiService.buildEmbeddings` — le code
 * d'indexation legacy EXACT (splitter 1000/200, text-embedding-3-small par lots de 300,
 * shape metadata, update des métriques documents) — derrière la frontière `DocumentIndexer`.
 * Compat avec `search_vectors`/le chat legacy PAR CONSTRUCTION ; seul NOTRE code est le
 * mapping ci-dessous (couvert par le test slim). `AiModule` n'est importé QUE par
 * `DocumentIngestionModule` : à la livraison du RAG TS, on supprime ce fichier et on
 * rebranche le token.
 */
@Injectable()
export class LegacyAiIndexer implements DocumentIndexer {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {}

  async index(doc: IndexableDocument, content: ExtractedContent): Promise<void> {
    // Format des callbacks `getDocumentChunks` legacy — `getSplittedChunks` recopie chaque
    // chunk (content vidé) en metadata, d'où doc_id/page/duration/start/end à plat ici.
    const chunks = content.chunks.map((chunk) => ({
      content: chunk.content,
      doc_id: doc.id,
      page: chunk.page,
      duration: chunk.duration ?? 0,
      start: chunk.start ?? 0,
      end: chunk.end ?? 0,
    }));

    await this.aiService.buildEmbeddings(
      doc.userId,
      { id: doc.id } as DocumentDto, // seul `id` est lu (`name` sert au log legacy)
      SOURCE_TYPE_BY_KIND[doc.kind] ?? DocumentSourceTypeEnum.FILE,
      null,
      async () => chunks,
    );
  }

  /** Purge de l'index du document — idempotence au retry + primitive du futur DELETE. */
  async remove(documentId: string): Promise<void> {
    const { error } = await this.supabase.from('embeddings').delete().eq('document_id', documentId);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
