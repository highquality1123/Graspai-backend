import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';
import { toFolder } from './folders.mapper';
import { Folder, FolderRow } from './model/notebook.types';

const FOLDER_SELECT = 'id, name, created_at, updated_at';

/**
 * Folders V2 — table `public.folders`. Scoping `user_id` → 404. Soft-delete via `deleted_at`.
 * Suppression = DÉTACHEMENT : les notebooks du dossier reviennent à la racine (`folder_id = null`),
 * PAS de cascade — aucun notebook/document n'est supprimé.
 */
@Injectable()
export class FoldersService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async create(userId: string, label: string): Promise<Folder> {
    const { data, error } = await this.supabase
      .from('folders')
      .insert({ id: uuidv4(), user_id: userId, name: label })
      .select(FOLDER_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toFolder(data as FolderRow);
  }

  async update(userId: string, folderId: string, label: string): Promise<Folder> {
    await this.assertOwned(userId, folderId);
    const { data, error } = await this.supabase
      .from('folders')
      .update({ name: label })
      .eq('id', folderId)
      .eq('user_id', userId) // defense-in-depth : re-scope l'écriture, en plus du assertOwned
      .select(FOLDER_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toFolder(data as FolderRow);
  }

  /** Détache les notebooks (folder_id → null) puis soft-supprime le dossier. Aucune cascade. */
  async deleteAndDetach(userId: string, folderId: string): Promise<void> {
    await this.assertOwned(userId, folderId);

    const { error: detachError } = await this.supabase
      .from('containers')
      .update({ folder_id: null })
      .eq('folder_id', folderId)
      .eq('user_id', userId);
    if (detachError) throw new InternalServerErrorException(detachError.message);

    const { error: deleteError } = await this.supabase
      .from('folders')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', folderId)
      .eq('user_id', userId);
    if (deleteError) throw new InternalServerErrorException(deleteError.message);
  }

  private async assertOwned(userId: string, folderId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('folders')
      .select('id')
      .eq('id', folderId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Folder not found', code: 'NOT_FOUND' });
  }
}
