import {
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { NotebookDocumentsService } from '../notebook-documents/notebook-documents.service';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateNotebookDto } from './model/create-notebook.dto';
import { UpdateNotebookDto } from './model/update-notebook.dto';
import {
  ContainerRow,
  Notebook,
  NotebookDetail,
  NotebookFolder,
  NotebookListItem,
  NotebookTree,
} from './model/notebook.types';
import { toNotebook, toNotebookListItem } from './notebooks.mapper';

// Colonnes exposables d'un container (jamais user_id / schema_version / deleted_at / migration_document_id).
const CONTAINER_SELECT = 'id, name, folder_id, pinned, visibility, prompt, last_accessed_at, created_at, updated_at';

/**
 * Notebooks V2 — stockés dans `public.containers`, mappés « notebook » par le mapper.
 * Scoping par `user_id` fait ICI (client service-role) : 404 si absent ou non-possédé.
 * Soft-delete : `deleted_at` ; toutes les lectures filtrent `deleted_at IS NULL`.
 * Table `containers` candidate RLS (chantier futur), comme `jobs`.
 */
@Injectable()
export class NotebooksService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(
    private readonly supabaseService: SupabaseService,
    private readonly documents: NotebookDocumentsService,
  ) {}

  /** GET /notebooks/:id — Notebook + ses documents (openapi.yaml → NotebookDetail). */
  async getDetail(userId: string, notebookId: string): Promise<NotebookDetail> {
    const row = await this.getOwnedContainer(userId, notebookId);
    // documents.list re-vérifie la propriété du notebook — redondant mais sans effet (idempotent).
    const documents = await this.documents.list(userId, notebookId);
    return { ...toNotebook(row), documents };
  }

  async getTree(userId: string): Promise<NotebookTree> {
    const [folders, containers] = await Promise.all([
      this.fetchActiveFolders(userId),
      this.fetchActiveContainers(userId),
    ]);
    const counts = await this.documentCountsByContainer(containers.map((c) => c.id));

    const activeFolderIds = new Set(folders.map((f) => f.id));
    const byFolder = new Map<string, NotebookListItem[]>();
    const rootNotebooks: NotebookListItem[] = [];

    for (const c of containers) {
      const item = toNotebookListItem(c, counts.get(c.id) ?? 0);
      // Un notebook dont le dossier est absent/supprimé retombe à la racine (jamais perdu).
      if (c.folder_id && activeFolderIds.has(c.folder_id)) {
        const arr = byFolder.get(c.folder_id) ?? [];
        arr.push(item);
        byFolder.set(c.folder_id, arr);
      } else {
        rootNotebooks.push(item);
      }
    }

    const folderNodes: NotebookFolder[] = folders.map((f) => ({
      id: f.id,
      label: f.name ?? '',
      notebooks: byFolder.get(f.id) ?? [],
    }));

    return { folders: folderNodes, rootNotebooks };
  }

  async create(userId: string, dto: CreateNotebookDto): Promise<Notebook> {
    if (dto.folderId != null) {
      await this.assertFolderOwned(userId, dto.folderId);
    }
    const { data, error } = await this.supabase
      .from('containers')
      .insert({
        id: uuidv4(),
        user_id: userId,
        name: dto.title,
        folder_id: dto.folderId ?? null,
        prompt: dto.prompt ?? null,
        visibility: dto.visibility ?? 'private',
        schema_version: 2, // marqueur explicite : notebook V2
      })
      .select(CONTAINER_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toNotebook(data as ContainerRow);
  }

  async update(userId: string, notebookId: string, dto: UpdateNotebookDto): Promise<Notebook> {
    await this.getOwnedContainer(userId, notebookId);

    const patch: Record<string, unknown> = {};
    if (dto.title !== undefined) patch.name = dto.title;
    if (dto.visibility !== undefined) patch.visibility = dto.visibility;
    if (Object.keys(patch).length === 0) {
      throw new UnprocessableEntityException({
        message: 'At least one field must be provided',
        code: 'VALIDATION_FAILED',
      });
    }
    return this.patchAndReturn(userId, notebookId, patch);
  }

  async togglePin(userId: string, notebookId: string): Promise<Notebook> {
    const row = await this.getOwnedContainer(userId, notebookId);
    return this.patchAndReturn(userId, notebookId, { pinned: !row.pinned });
  }

  async move(userId: string, notebookId: string, folderId: string | null): Promise<Notebook> {
    await this.getOwnedContainer(userId, notebookId);
    if (folderId !== null) {
      await this.assertFolderOwned(userId, folderId);
    }
    return this.patchAndReturn(userId, notebookId, { folder_id: folderId });
  }

  async softDelete(userId: string, notebookId: string): Promise<void> {
    await this.getOwnedContainer(userId, notebookId);
    const { error } = await this.supabase
      .from('containers')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', notebookId)
      .eq('user_id', userId);
    if (error) throw new InternalServerErrorException(error.message);
  }

  // ── privé ────────────────────────────────────────────────────────────────

  private async getOwnedContainer(userId: string, notebookId: string): Promise<ContainerRow> {
    const { data, error } = await this.supabase
      .from('containers')
      .select(CONTAINER_SELECT)
      .eq('id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Notebook not found', code: 'NOT_FOUND' });
    return data as ContainerRow;
  }

  private async assertFolderOwned(userId: string, folderId: string): Promise<void> {
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

  private async patchAndReturn(userId: string, notebookId: string, patch: Record<string, unknown>): Promise<Notebook> {
    const { data, error } = await this.supabase
      .from('containers')
      .update(patch)
      .eq('id', notebookId)
      .eq('user_id', userId) // defense-in-depth : re-scope l'écriture, en plus du check de propriété
      .select(CONTAINER_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toNotebook(data as ContainerRow);
  }

  private async fetchActiveFolders(userId: string): Promise<{ id: string; name: string | null }[]> {
    const { data, error } = await this.supabase
      .from('folders')
      .select('id, name')
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: true });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as { id: string; name: string | null }[];
  }

  private async fetchActiveContainers(userId: string): Promise<ContainerRow[]> {
    const { data, error } = await this.supabase
      .from('containers')
      .select(CONTAINER_SELECT)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('pinned', { ascending: false })
      .order('updated_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return (data ?? []) as ContainerRow[];
  }

  private async documentCountsByContainer(containerIds: string[]): Promise<Map<string, number>> {
    const counts = new Map<string, number>();
    if (containerIds.length === 0) return counts;
    const { data, error } = await this.supabase
      .from('documents')
      .select('container_id')
      .in('container_id', containerIds);
    if (error) throw new InternalServerErrorException(error.message);
    for (const row of (data ?? []) as { container_id: string | null }[]) {
      if (row.container_id) counts.set(row.container_id, (counts.get(row.container_id) ?? 0) + 1);
    }
    return counts;
  }
}
