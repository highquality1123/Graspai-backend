import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNoteDto } from './model/create-note.dto';
import { UpdateNoteDto } from './model/update-note.dto';
import { Note, NoteRow } from './model/note.types';
import { toNote } from './notebook-notes.mapper';

// Colonnes exposables d'une note (jamais user_id).
const NOTE_SELECT = 'id, container_id, title, content, document_id, created_at, updated_at';

/**
 * Notes V2 — stockées dans `public.notes`, imbriquées sous un notebook (`container_id`).
 * Scoping par `user_id` fait ICI (client service-role) : 404 si absent ou non-possédé.
 * PAS de soft-delete (décision contrat, openapi.yaml:752-753) : le DELETE est un hard delete.
 * Une note « cesse d'être servie » quand son notebook parent est soft-deleted -> chaque opération
 * vérifie d'abord que le container parent est possédé ET actif (deleted_at IS NULL).
 */
@Injectable()
export class NotebookNotesService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async list(userId: string, notebookId: string): Promise<Note[]> {
    await this.assertNotebookOwned(userId, notebookId);
    const { data, error } = await this.supabase
      .from('notes')
      .select(NOTE_SELECT)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .order('updated_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as NoteRow[]).map((row) => toNote(row));
  }

  async create(userId: string, notebookId: string, dto: CreateNoteDto): Promise<Note> {
    await this.assertNotebookOwned(userId, notebookId);
    if (dto.sourceDocumentId) {
      await this.assertDocumentOwned(userId, notebookId, dto.sourceDocumentId);
    }
    const { data, error } = await this.supabase
      .from('notes')
      .insert({
        id: uuidv4(),
        user_id: userId,
        container_id: notebookId,
        title: dto.title,
        content: dto.body,
        document_id: dto.sourceDocumentId ?? null, // corrige le bug legacy : document_id enfin persisté
      })
      .select(NOTE_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toNote(data as NoteRow);
  }

  async get(userId: string, notebookId: string, noteId: string): Promise<Note> {
    return toNote(await this.getOwnedNote(userId, notebookId, noteId));
  }

  async update(userId: string, notebookId: string, noteId: string, dto: UpdateNoteDto): Promise<Note> {
    await this.getOwnedNote(userId, notebookId, noteId);

    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.title = dto.title;
    if (dto.body !== undefined) patch.content = dto.body;
    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        message: 'At least one field must be provided',
        code: 'VALIDATION_FAILED',
      });
    }
    const { data, error } = await this.supabase
      .from('notes')
      .update(patch)
      .eq('id', noteId)
      .eq('user_id', userId) // defense-in-depth : re-scope l'écriture, en plus du check de propriété
      .select(NOTE_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toNote(data as NoteRow);
  }

  async remove(userId: string, notebookId: string, noteId: string): Promise<void> {
    await this.getOwnedNote(userId, notebookId, noteId);
    // Hard delete : pas de soft-delete pour les notes en Phase 1 (openapi.yaml:752-753).
    const { error } = await this.supabase.from('notes').delete().eq('id', noteId).eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  // ── privé ────────────────────────────────────────────────────────────────

  /** Le notebook parent doit être possédé ET actif : soft-delete du notebook -> notes injoignables (404). */
  private async assertNotebookOwned(userId: string, notebookId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('containers')
      .select('id')
      .eq('id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Notebook not found', code: 'NOT_FOUND' });
  }

  /**
   * Le document source doit exister, appartenir au user ET au même notebook — sinon 404
   * (même pattern que les sources de Summaries, on ne révèle pas l'existence). Sans ce check :
   * un uuid inexistant → violation FK PostgREST → 500 (le contrat prévoit 404/422 ici), et le
   * document d'un autre user serait référençable — son ON DELETE CASCADE détruirait la note
   * à la suppression du document étranger.
   */
  private async assertDocumentOwned(userId: string, notebookId: string, documentId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('documents')
      .select('id')
      .eq('id', documentId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Document not found', code: 'NOT_FOUND' });
  }

  private async getOwnedNote(userId: string, notebookId: string, noteId: string): Promise<NoteRow> {
    await this.assertNotebookOwned(userId, notebookId);
    const { data, error } = await this.supabase
      .from('notes')
      .select(NOTE_SELECT)
      .eq('id', noteId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Note not found', code: 'NOT_FOUND' });
    return data as NoteRow;
  }
}
