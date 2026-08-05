import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { CreateNoteDto } from './model/create-note.dto';
import { Note } from './model/note.types';
import { UpdateNoteDto } from './model/update-note.dto';
import { NotebookNotesService } from './notebook-notes.service';

@ApiTags('Notes')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/notes')
export class NotebookNotesController {
  constructor(private readonly notes: NotebookNotesService) {}

  @Get()
  list(@CurrentUser() user: AuthUser, @Param('notebookId', ParseUUIDPipe) notebookId: string): Promise<Note[]> {
    return this.notes.list(user.userId, notebookId);
  }

  @Post()
  create(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Body() dto: CreateNoteDto,
  ): Promise<Note> {
    return this.notes.create(user.userId, notebookId, dto);
  }

  @Get(':noteId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ): Promise<Note> {
    return this.notes.get(user.userId, notebookId, noteId);
  }

  @Patch(':noteId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
    @Body() dto: UpdateNoteDto,
  ): Promise<Note> {
    return this.notes.update(user.userId, notebookId, noteId, dto);
  }

  @Delete(':noteId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('noteId', ParseUUIDPipe) noteId: string,
  ): Promise<void> {
    return this.notes.remove(user.userId, notebookId, noteId);
  }
}
