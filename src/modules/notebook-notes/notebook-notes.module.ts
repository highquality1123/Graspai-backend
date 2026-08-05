import { Module } from '@nestjs/common';
import { NotebookNotesController } from './notebook-notes.controller';
import { NotebookNotesService } from './notebook-notes.service';

/**
 * Domaine V2 Notes d'un notebook (routes `/notebooks/:notebookId/notes`).
 * Nommé `notebook-notes` par uniformité de famille avec `notebook-documents` et
 * `notebook-summaries`. SupabaseService est global (pas d'import).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  controllers: [NotebookNotesController],
  providers: [NotebookNotesService],
})
export class NotebookNotesModule {}
