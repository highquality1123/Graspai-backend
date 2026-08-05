import { Module } from '@nestjs/common';
import { NotebookDocumentsModule } from '../notebook-documents/notebook-documents.module';
import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';
import { NotebooksController } from './notebooks.controller';
import { NotebooksService } from './notebooks.service';

/**
 * Domaine V2 Notebooks + Folders. SupabaseService est global (pas d'import).
 * Importe NotebookDocumentsModule pour composer NotebookDetail (GET /notebooks/:id).
 * Les Notes vivent dans leur propre module (`notebook-notes/`, convention famille).
 * Ajouté à V2_MODULES pour apparaître dans le Swagger V2.
 */
@Module({
  imports: [NotebookDocumentsModule],
  controllers: [NotebooksController, FoldersController],
  providers: [NotebooksService, FoldersService],
})
export class NotebooksModule {}
