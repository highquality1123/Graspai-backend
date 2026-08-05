import { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { HealthModule } from '../../modules/health/health.module';
import { JobsModule } from '../../modules/jobs/jobs.module';
import { NotebooksModule } from '../../modules/notebooks/notebooks.module';
import { NotebookDocumentsModule } from '../../modules/notebook-documents/notebook-documents.module';
import { NotebookSummariesModule } from '../../modules/notebook-summaries/notebook-summaries.module';
import { NotebookNotesModule } from '../../modules/notebook-notes/notebook-notes.module';
import { SearchModule } from '../../modules/search/search.module';
import { StudySessionsModule } from '../../modules/study-sessions/study-sessions.module';
import { UsersModule } from '../../modules/users/users.module';

/**
 * Whitelist des modules documentés dans le Swagger généré (/api).
 * On n'y met QUE les modules du backend V2. Les 16 controllers legacy restent servis
 * normalement mais n'apparaissent jamais dans la doc — ils ne sont pas dans cette liste,
 * et `include` ne scanne que les modules listés (opt-in strict, un legacy ne peut pas fuiter).
 *
 * Ajouter ici chaque nouveau domaine V2 (Notebooks, Notes, ...) au fur et à mesure ;
 * il apparaîtra alors dans /api.
 */
export const V2_MODULES = [
  HealthModule,
  JobsModule,
  NotebooksModule,
  NotebookDocumentsModule,
  NotebookSummariesModule,
  NotebookNotesModule,
  SearchModule,
  StudySessionsModule,
  UsersModule,
];

export function setupSwagger(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle('Graspr API V2')
    .setDescription('Backend V2 en construction. Contrat gelé : openapi.yaml (contract-v1).')
    .setVersion('2.0')
    .addBearerAuth()
    .build();

  const document = SwaggerModule.createDocument(app, config, { include: V2_MODULES });
  SwaggerModule.setup('api', app, document);
}
