import { Injectable, InternalServerErrorException, UnprocessableEntityException } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { v4 as uuidv4 } from 'uuid';
import { SupabaseService } from '../supabase/supabase.service';
import { CreateStudySessionDto } from './model/create-study-session.dto';
import { StudySession, StudySessionRow } from './model/study-session.types';
import { toStudySession } from './study-sessions.mapper';

// Colonnes exposables d'une session (jamais user_id).
const STUDY_SESSION_SELECT = 'id, notebook_id, duration_seconds, completed_at, created_at';

/**
 * Study sessions V2 — journal de focus timer (`public.study_sessions`), alimente streak + stats.
 * Scoping par `user_id` fait ICI (client service-role). `notebookId` optionnel : si fourni, le
 * notebook doit être possédé ET actif, sinon 422 (le contrat POST /study-sessions ne déclare PAS
 * de 404 — décision Othmane ; un notebookId inutilisable est une erreur de validation).
 * Immuable : un seul POST, pas d'update/delete.
 */
@Injectable()
export class StudySessionsService {
  private readonly supabase: SupabaseClient = this.supabaseService.getClient();

  constructor(private readonly supabaseService: SupabaseService) {}

  async log(userId: string, dto: CreateStudySessionDto): Promise<StudySession> {
    if (dto.notebookId != null) {
      await this.assertNotebookOwned(userId, dto.notebookId);
    }
    const { data, error } = await this.supabase
      .from('study_sessions')
      .insert({
        id: uuidv4(),
        user_id: userId,
        notebook_id: dto.notebookId ?? null,
        duration_seconds: dto.durationSeconds,
        completed_at: dto.completedAt,
      })
      .select(STUDY_SESSION_SELECT)
      .single();
    if (error) throw new InternalServerErrorException(error.message);
    return toStudySession(data as StudySessionRow);
  }

  // ── privé ────────────────────────────────────────────────────────────────

  /** Le notebook référencé doit être possédé ET actif (deleted_at IS NULL) -> 422 sinon (pas de 404 au contrat). */
  private async assertNotebookOwned(userId: string, notebookId: string): Promise<void> {
    const { data, error } = await this.supabase
      .from('containers')
      .select('id')
      .eq('id', notebookId)
      .eq('user_id', userId)
      .is('deleted_at', null)
      .maybeSingle();
    if (error) throw new InternalServerErrorException(error.message);
    if (!data) {
      throw new UnprocessableEntityException({
        message: 'notebookId must reference an existing notebook you own',
        code: 'VALIDATION_FAILED',
      });
    }
  }
}
