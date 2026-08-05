import { Module } from '@nestjs/common';
import { NotesController } from './notes.controller';
import { NotesService } from './notes.service';
import { DocumentsModule } from '../documents/documents.module';
import { ContainersModule } from "../containers/containers.module";

@Module({
  imports: [DocumentsModule, ContainersModule],
  controllers: [NotesController],
  providers: [NotesService],
  exports: [NotesService],
})
export class NotesModule {}
