import { Injectable, Logger } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../../supabase/supabase.service';

/** Un chunk de contexte (colonne `content` d'`embeddings`, page = repère legacy). */
export interface SourcePiece {
  content: string;
  page: number;
}

/** Le contenu retenu d'un document source, après application du budget. */
export interface DocumentSource {
  documentId: string;
  label: string;
  pieces: SourcePiece[];
}

/** Budget total de contexte — parité `CHAT_MODEL_MAX_INPUT_TOKENS` legacy (fenêtre gpt-4o-mini 128k, marge prompts + sortie). */
export const SUMMARY_CONTEXT_TOKEN_BUDGET = 100_000;

/**
 * Répartition équitable du budget entre documents, avec redistribution en cascade :
 * chaque doc reçoit une part égale ; ceux qui pèsent moins que leur part passent
 * intégralement et libèrent leur surplus pour les autres. Garanties : total ≤ budget,
 * CHAQUE source représentée (un gros doc ne peut pas évincer les petits), et sur un
 * notebook mono-document le comportement dégénère exactement en le legacy (budget entier).
 * Exportée pour être testée directement (les 4 scénarios chiffrés du plan goal 1).
 */
export function allocateBudgets(totals: number[], totalBudget: number): number[] {
  const budgets = new Array<number>(totals.length).fill(0);
  const pending = new Set(totals.map((_, i) => i));
  let remaining = totalBudget;
  let changed = true;
  while (changed && pending.size > 0) {
    changed = false;
    const share = remaining / pending.size;
    for (const i of [...pending]) {
      if (totals[i] <= share) {
        budgets[i] = totals[i];
        remaining -= totals[i];
        pending.delete(i);
        changed = true;
      }
    }
  }
  const share = pending.size > 0 ? remaining / pending.size : 0;
  for (const i of pending) {
    budgets[i] = share;
  }
  return budgets;
}

/**
 * Lecture des sources d'un résumé depuis la table `embeddings` — LE point de contact avec
 * l'index du RAG côté Summaries (lecture simple par document_id, aucun vectoriel). Réplique
 * `getDocumentPiecesForSummary` legacy (chat.service.ts:227-251 : tri par page, filtre
 * modulaire `page % divider === 1`), étendue multi-documents via `allocateBudgets`.
 * Volontairement un provider SIMPLE (pas de token DI) tant que la frontière avec la
 * réécriture RAG n'est pas discutée — c'est ce fichier que Giovanni rebranchera.
 */
@Injectable()
export class SummarySourceReader {
  private readonly logger = new Logger(SummarySourceReader.name);
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async read(documentIds: string[]): Promise<DocumentSource[]> {
    const [labels, rowsByDoc] = await Promise.all([this.fetchLabels(documentIds), this.fetchPieces(documentIds)]);

    const totals = documentIds.map((id) => (rowsByDoc.get(id) ?? []).reduce((acc, r) => acc + (r.token ?? 0), 0));
    const budgets = allocateBudgets(totals, SUMMARY_CONTEXT_TOKEN_BUDGET);

    return documentIds.map((documentId, i) => {
      const rows = rowsByDoc.get(documentId) ?? [];
      let kept = rows;
      if (totals[i] > budgets[i] && budgets[i] > 0) {
        // Filtre modulaire legacy, appliqué PAR document (échantillonnage uniforme des pages).
        const divider = Math.ceil(totals[i] / budgets[i]);
        kept = rows.filter((r) => Number(r.page_number) % divider === 1);
        this.logger.log(`Document ${documentId}: sampled 1 page in ${divider} (${totals[i]} tokens > budget)`);
      }
      return {
        documentId,
        label: labels.get(documentId) ?? '',
        pieces: kept.map((r) => ({ content: r.content ?? '', page: Number(r.page_number) || 0 })),
      };
    });
  }

  private async fetchLabels(documentIds: string[]): Promise<Map<string, string>> {
    const { data, error } = await this.supabase.from('documents').select('id, name').in('id', documentIds);
    if (error) throw new Error(`Could not read source documents: ${error.message}`);
    return new Map(((data ?? []) as { id: string; name: string | null }[]).map((d) => [d.id, d.name ?? '']));
  }

  private async fetchPieces(
    documentIds: string[],
  ): Promise<Map<string, { token: number | null; content: string | null; page_number: number }[]>> {
    const { data, error } = await this.supabase
      .from('embeddings')
      .select('document_id, token, content, metadata->page_number')
      .in('document_id', documentIds)
      .order('metadata->page_number', { ascending: true });
    if (error) throw new Error(`Could not read source content: ${error.message}`);

    const byDoc = new Map<string, { token: number | null; content: string | null; page_number: number }[]>();
    for (const row of (data ?? []) as {
      document_id: string;
      token: number | null;
      content: string | null;
      page_number: number;
    }[]) {
      const arr = byDoc.get(row.document_id) ?? [];
      arr.push(row);
      byDoc.set(row.document_id, arr);
    }
    return byDoc;
  }
}
