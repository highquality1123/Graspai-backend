import { Module } from '@nestjs/common';
import { HealthModule } from './modules/health/health.module';
import { CustomConfigModule } from './config/config.module';
import { S3Module } from './modules/s3/s3.module';
import { AuthModule } from './modules/auth/auth.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { ContainersModule } from './modules/containers/containers.module';
import { StripeModule } from './modules/stripe/stripe.module';
import { ChatModule } from './modules/chat/chat.module';
import { QuizModule } from './modules/quiz/quiz.module';
import { NotesModule } from './modules/notes/notes.module';
import { FlashcardsModule } from './modules/flashcards/flashcards.module';
import { AudioModule } from './modules/audio/audio.module';
import { AdminStatsModule } from './modules/admin-stats/admin-stats.module';
import { FoldersModule } from './modules/folders/folders.module';
import { VideoModule } from './modules/video/video.module';
import { GeneratedVideosModule } from './modules/generated-videos/generated-videos.module';
import { CustomerioModule } from './modules/customerio/customerio.module';
import { AmplitudeModule } from './modules/amplitude/amplitude.module';
import { SupabaseModule } from './modules/supabase/supabase.module';
import { SessionModule } from './modules/session/session.module';
import { CoreModule } from './core/core.module';
import { JobsModule } from './modules/jobs/jobs.module';
import { NotebooksModule } from './modules/notebooks/notebooks.module';
import { NotebookDocumentsModule } from './modules/notebook-documents/notebook-documents.module';
import { NotebookSummariesModule } from './modules/notebook-summaries/notebook-summaries.module';
import { NotebookNotesModule } from './modules/notebook-notes/notebook-notes.module';
import { SearchModule } from './modules/search/search.module';
import { StudySessionsModule } from './modules/study-sessions/study-sessions.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    CoreModule,
    JobsModule,
    NotebooksModule,
    NotebookDocumentsModule,
    NotebookSummariesModule,
    NotebookNotesModule,
    SearchModule,
    StudySessionsModule,
    UsersModule,
    SupabaseModule,
    SessionModule,
    HealthModule,
    CustomConfigModule,
    S3Module,
    AuthModule,
    DocumentsModule,
    FoldersModule,
    ContainersModule,
    AudioModule,
    StripeModule,
    VideoModule,
    GeneratedVideosModule,
    ChatModule,
    QuizModule,
    NotesModule,
    FlashcardsModule,
    AdminStatsModule,
    CustomerioModule,
    AmplitudeModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
