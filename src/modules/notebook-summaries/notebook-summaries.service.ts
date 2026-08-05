import {
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { JOB_QUEUE, JobAccepted, JobQueue } from '../jobs/job-queue';
import { JobStatus } from '../jobs/model/job.types';
import { SupabaseService } from '../supabase/supabase.service';
import { GenerateSummaryDto } from './model/generate-summary.dto';
import { NotebookSummary, SummaryGenerationPayload, SummaryRow } from './model/summary.types';
import { toNotebookSummary } from './notebook-summaries.mapper';

// Colonnes exposables (jamais user_id / deleted_at / updated_at).
const SUMMARY_SELECT = 'id, container_id, title, body, word_count, source_document_ids, length, format, created_at';

/**
 * Summaries V2 d'un notebook — génération asynchrone (table `summaries`, migration 011).
 * Scoping par `user_id` fait ICI (client service-role) : 404 si absent ou non-possédé.
 * Particularité contrat : le 202 ne renvoie PAS d'id — la ligne naît à la complétion du job
 * (`Job.resourceId` porte le lien à ready), donc ni colonne de statut ni lien job.
 * Soft-delete `deleted_at` ; toutes les lectures filtrent `deleted_at IS NULL`.
 * Quota/429 : NON implémenté — écart de contrat tracé (v2-socle-debt.md §9).
 */
@Injectable()
export class NotebookSummariesService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(
    private readonly supabaseService: SupabaseService,
    @Inject(JOB_QUEUE) private readonly jobQueue: JobQueue,
  ) {}

  async generate(userId: string, notebookId: string, dto: GenerateSummaryDto): Promise<JobAccepted> {
    await this.assertNotebookOwned(userId, notebookId);
    const documentIds = await this.resolveSources(userId, notebookId, dto.documentIds);
    const payload: SummaryGenerationPayload = { notebookId, documentIds, length: dto.length, format: dto.format };
    return this.jobQueue.enqueue(userId, { resourceType: 'summary', payload });
  }

  async list(userId: string, notebookId: string): Promise<NotebookSummary[]> {
    await this.assertNotebookOwned(userId, notebookId);
    const { data, error } = await this.supabase
      .from('summaries')
      .select(SUMMARY_SELECT)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .order('created_at', { ascending: false });
    if (error) throw new InternalServerErrorException(error.message);
    return ((data ?? []) as unknown as SummaryRow[]).map(toNotebookSummary);
  }

  async get(userId: string, notebookId: string, summaryId: string): Promise<NotebookSummary> {
    await this.assertNotebookOwned(userId, notebookId);
    const { data, error } = await this.supabase
      .from('summaries')
      .select(SUMMARY_SELECT)
      .eq('id', summaryId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Summary not found', code: 'NOT_FOUND' });
    return toNotebookSummary(data as unknown as SummaryRow);
  }

  /**
   * Soft-delete (arbitrage B) : `deleted_at = now()`, lectures déjà filtrées. Un summary
   * déjà supprimé renvoie 404 comme un absent — pas de « double delete » distinguable.
   * NB : le contrat AUTORISE cette suppression là où le legacy l'interdisait (x-status new).
   */
  async softDelete(userId: string, notebookId: string, summaryId: string): Promise<void> {
    await this.assertNotebookOwned(userId, notebookId);
    await this.assertSummaryOwned(userId, notebookId, summaryId);
    const { error } = await this.supabase
      .from('summaries')
      .update({ deleted_at: new Date().toISOString() })
      .eq('id', summaryId)
      .eq('container_id', notebookId)
      .eq('user_id', userId); // defense-in-depth : re-scope l'écriture, en plus du check de propriété
    if (error) throw new InternalServerErrorException(error.message);
  }

  // ── privé ────────────────────────────────────────────────────────────────

  private async assertSummaryOwned(userId: string, notebookId: string, summaryId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('summaries')
      .select('id')
      .eq('id', summaryId)
      .eq('container_id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Summary not found', code: 'NOT_FOUND' });
  }

  /**
   * Résout et VALIDE les sources au POST (arbitrage D) :
   * ids non possédés / hors notebook → 404 (on ne révèle pas l'existence) ;
   * document pas encore ingéré → 422 SOURCE_NOT_READY ; aucune source → 422 NO_SOURCES.
   * Le statut vient du job lié (`ingest_job_id`, migration 008) ; sans job (legacy) = ready.
   */
  private async resolveSources(userId: string, notebookId: string, requested?: string[]): Promise<string[]> {
    let query = this.supabase
      .from('documents')
      .select('id, ingest_job:ingest_job_id (status)')
      .eq('container_id', notebookId)
      .eq('user_id', userId);
    if (requested?.length) {
      query = query.in('id', requested);
    }
    const { data, error } = await query;
    if (error) throw new InternalServerErrorException(error.message);
    const rows = (data ?? []) as unknown as { id: string; ingest_job: { status: JobStatus } | null }[];

    if (requested?.length) {
      const found = new Set(rows.map((r) => r.id));
      if (requested.some((id) => !found.has(id))) {
        throw new NotFoundException({ message: 'Document not found', code: 'NOT_FOUND' });
      }
    }
    if (rows.length === 0) {
      throw new UnprocessableEntityException({
        message: 'This notebook has no documents to summarize',
        code: 'NO_SOURCES',
      });
    }
    const notReady = rows.filter((r) => (r.ingest_job?.status ?? 'ready') !== 'ready');
    if (notReady.length > 0) {
      throw new UnprocessableEntityException({
        message: `${notReady.length} document(s) are still being processed — retry once ingestion is complete`,
        code: 'SOURCE_NOT_READY',
      });
    }
    return rows.map((r) => r.id);
  }

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
}
