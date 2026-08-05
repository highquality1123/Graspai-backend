import { BadRequestException, Injectable, InternalServerErrorException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { ContainerHitRow, DocumentHit, DocumentHitRow, NoteHit, NoteHitRow, SearchResult } from './model/search.types';
import { toDocumentHit, toNoteHit, toNotebookHit } from './search.mapper';

// Cap par catégorie (recherche top-bar ; liste bornée -> pas de pagination au contrat).
const SEARCH_LIMIT = 20;

/**
 * Échappe les métacaractères du pattern LIKE/ILIKE (`%`, `_`, et `\` l'échappeur lui-même) :
 * un terme utilisateur contenant `100%` ou `mon_document` est cherché LITTÉRALEMENT —
 * sans ça, `%` matche tout et `_` matche n'importe quel caractère. Exportée pour les tests.
 */
export function escapeLikePattern(term: string): string {
  return term.replace(/[\\%_]/g, (c) => `\\${c}`);
}

// Colonnes exposables par table (jamais user_id / deleted_at). `container_id` -> notebookId au mapper.
const CONTAINER_SELECT = 'id, name';
const DOCUMENT_SELECT = 'id, name, container_id';
const NOTE_SELECT = 'id, title, content, container_id';

/**
 * Recherche globale V2 (top bar) — full-text simple par NOM/TITRE (openapi.yaml:1186),
 * scopée au user (Bearer). Documents/notes sont limités aux notebooks ACTIFS du user :
 * un notebook soft-deleted masque ses enfants (cohérent avec openapi.yaml:204).
 * Aucune table dédiée ; lit containers/documents/notes. `q` vide -> 400 (pas de 422 au contrat).
 */
@Injectable()
export class SearchService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async search(userId: string, q: string): Promise<SearchResult> {
    const term = (q ?? '').trim();
    if (!term) {
      throw new BadRequestException({ message: 'q must not be empty', code: 'BAD_REQUEST' });
    }

    const active = await this.fetchActiveContainers(userId);
    const notebooks = this.matchNotebooks(active, term);

    const activeIds = active.map((c) => c.id);
    if (activeIds.length === 0) {
      return { notebooks, documents: [], notes: [] };
    }

    const [documents, notes] = await Promise.all([
      this.searchDocuments(userId, term, activeIds),
      this.searchNotes(userId, term, activeIds),
    ]);
    return { notebooks, documents, notes };
  }

  // ── privé ────────────────────────────────────────────────────────────────

  /** Tous les notebooks actifs du user : sert le résultat notebooks ET le scoping documents/notes. */
  private async fetchActiveContainers(userId: string): Promise<ContainerHitRow[]> {
    const { data, error } = await this.supabase
      .from('containers')
      .select(CONTAINER_SELECT)
      .eq('user_id', userId)
      .is('deleted_at', null);
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as ContainerHitRow[];
  }

  /** Filtre in-memory par nom (les notebooks actifs sont déjà chargés pour le scoping). */
  private matchNotebooks(active: ContainerHitRow[], term: string): SearchResult['notebooks'] {
    const t = term.toLowerCase();
    return active
      .filter((c) => (c.name ?? '').toLowerCase().includes(t))
      .slice(0, SEARCH_LIMIT)
      .map(toNotebookHit);
  }

  private async searchDocuments(userId: string, term: string, activeIds: string[]): Promise<DocumentHit[]> {
    const { data, error } = await this.supabase
      .from('documents')
      .select(DOCUMENT_SELECT)
      .eq('user_id', userId)
      .in('container_id', activeIds)
      .ilike('name', `%${escapeLikePattern(term)}%`)
      .limit(SEARCH_LIMIT);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as DocumentHitRow[]).map(toDocumentHit);
  }

  private async searchNotes(userId: string, term: string, activeIds: string[]): Promise<NoteHit[]> {
    const { data, error } = await this.supabase
      .from('notes')
      .select(NOTE_SELECT)
      .eq('user_id', userId)
      .in('container_id', activeIds)
      .ilike('title', `%${escapeLikePattern(term)}%`)
      .limit(SEARCH_LIMIT);
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as NoteHitRow[]).map(toNoteHit);
  }
}
