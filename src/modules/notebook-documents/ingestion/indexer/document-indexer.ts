import { ExtractedContent } from '../extraction/extracted-content';

/** Ce que l'indexation a besoin de savoir du document (le reste vit dans `ExtractedContent`). */
export interface IndexableDocument {
  id: string;
  userId: string;
  kind: string;
}

/**
 * FRONTIÈRE RAG — le contrat entre le domaine Documents et le RAG (Giovanni).
 *
 * Le domaine possède le cycle de vie (upload, stockage, statut, extraction) ; le RAG possède
 * la représentation vectorielle. `index` couvre les stages `chunking` + `indexing` du contrat
 * Job. `remove` supprime l'index d'un document — UNE primitive, DEUX usages : l'idempotence
 * au retry (le handler purge avant de ré-indexer, cf. v2-socle-debt.md §6) et le futur
 * DELETE document.
 *
 * Impl V1 : `LegacyAiIndexer` (wrap du code d'indexation legacy exact — compat par
 * construction avec `search_vectors`/le chat). La réécriture TS du RAG remplacera l'impl en
 * rebranchant ce token, sans toucher au domaine.
 */
export interface DocumentIndexer {
  index(doc: IndexableDocument, content: ExtractedContent): Promise<void>;
  remove(documentId: string): Promise<void>;
}

export const DOCUMENT_INDEXER = Symbol('DOCUMENT_INDEXER');
