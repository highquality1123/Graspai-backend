import { Injectable, InternalServerErrorException, NotFoundException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { EnqueueInput, JobAccepted } from './job-queue';
import { toJob } from './jobs.mapper';
import { PROVISIONAL_ESTIMATED_SECONDS } from './model/estimated-seconds';
import { Job, JobRow, JobStage } from './model/job.types';

/**
 * Accès et transitions d'état sur la table `jobs` (le "repository" de la file d'attente).
 * Scoping par `user_id` fait ICI, au niveau applicatif (le client Supabase est service-role et
 * bypass RLS). La table `jobs` est candidate RLS pour le futur chantier RLS/RBAC.
 */
@Injectable()
export class JobsService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async create(userId: string, input: EnqueueInput): Promise<JobAccepted> {
    const estimatedSeconds = input.estimatedSeconds ?? PROVISIONAL_ESTIMATED_SECONDS[input.resourceType];
    const { data, error } = await this.supabase
      .from('jobs')
      .insert({ user_id: userId, resource_type: input.resourceType, payload: input.payload ?? null })
      .select('id')
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return { jobId: data.id, estimatedSeconds };
  }

  async getForUser(userId: string, jobId: string): Promise<Job> {
    const { data, error } = await this.supabase
      .from('jobs')
      .select('*')
      .eq('id', jobId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) throw new NotFoundException({ message: 'Job not found', code: 'NOT_FOUND' });
    return toJob(data as JobRow);
  }

  /** Réclame atomiquement le prochain job pending (RPC FOR UPDATE SKIP LOCKED). */
  async claimNextJob(): Promise<JobRow | null> {
    const { data, error } = await this.supabase.rpc('claim_next_job');
    if (error) throw new InternalServerErrorException(error.message);
    const row = Array.isArray(data) ? data[0] : data;
    return (row as JobRow) ?? null;
  }

  /**
   * Reprise des orphelins au démarrage : les jobs restés 'processing' (conteneur redéployé) sont
   * remis en 'pending' s'il reste des tentatives, sinon marqués 'failed'.
   */
  async recoverOrphans(maxAttempts: number): Promise<{ requeued: number; failed: number }> {
    const { data: requeued, error: e1 } = await this.supabase
      .from('jobs')
      .update({ status: 'pending', locked_at: null })
      .eq('status', 'processing')
      .lt('attempts', maxAttempts)
      .select('id');
    if (e1) throw new InternalServerErrorException(e1.message);

    const { data: failed, error: e2 } = await this.supabase
      .from('jobs')
      .update({ status: 'failed', error: 'Orphaned after worker restart (max attempts reached)', locked_at: null })
      .eq('status', 'processing')
      .gte('attempts', maxAttempts)
      .select('id');
    if (e2) throw new InternalServerErrorException(e2.message);

    return { requeued: requeued?.length ?? 0, failed: failed?.length ?? 0 };
  }

  markStage(jobId: string, stage: JobStage): Promise<void> {
    return this.patch(jobId, { stage });
  }

  markProgress(jobId: string, progress: number): Promise<void> {
    return this.patch(jobId, { progress });
  }

  markReady(jobId: string, resourceId: string): Promise<void> {
    return this.patch(jobId, { status: 'ready', resource_id: resourceId, progress: 100, stage: null, locked_at: null });
  }

  markFailed(jobId: string, error: string): Promise<void> {
    return this.patch(jobId, { status: 'failed', error, locked_at: null });
  }

  requeue(jobId: string): Promise<void> {
    return this.patch(jobId, { status: 'pending', locked_at: null });
  }

  private async patch(jobId: string, patch: Record<string, unknown>): Promise<void> {
    const { error } = await this.supabase.from('jobs').update(patch).eq('id', jobId);
    if (error) throw new InternalServerErrorException(error.message);
  }
}
