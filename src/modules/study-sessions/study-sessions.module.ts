import { Module } from '@nestjs/common';
import { StudySessionsController } from './study-sessions.controller';
import { StudySessionsService } from './study-sessions.service';

/**
 * Domaine V2 Study Sessions (POST /study-sessions). SupabaseService est global (pas d'import).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  controllers: [StudySessionsController],
  providers: [StudySessionsService],
})
export class StudySessionsModule {}
