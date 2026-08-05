import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { CreateNoteDto } from './model/CreateNote.dto';
import { UpdateNoteDto } from './model/UpdateNote.dto';
import { DocumentsService } from '../documents/documents.service';
import { ContainersService } from '../containers/containers.service';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class NotesService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly documentsService: DocumentsService,
    private readonly containersService: ContainersService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async create(userId: string, note: CreateNoteDto) {
    try {
      if (!note.containerId || !note.title || !note.content) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }
      await this.containersService.verifyUserAccessAndGetContainer(userId, note.containerId);

      const newNote = {
        title: note.title,
        content: note.content,
        user_id: userId,
        container_id: note.containerId,
      };

      const { data: created_note } = await this.supabase.from('notes').insert(newNote).select('*').single();

      return created_note;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async update(userId: string, note: UpdateNoteDto) {
    try {
      if (!note.id || (!note.title && !note.content)) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }
      await this.verifyUserAccessAndGetNote(userId, note.id);

      const { data: notes } = await this.supabase
        .from('notes')
        .update({
          title: note.title,
          content: note.content,
          updated_at: 'NOW()',
        })
        .eq('id', note.id)
        .select('*');

      return {
        notes,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async getNotesByDocumentId(userId: string, documentId: string) {
    try {
      if (!documentId) {
        throw new HttpException('Document id is required', HttpStatus.BAD_REQUEST);
      }
      await this.documentsService.verifyUserAccessAndGetDocument(userId, documentId);

      const { data: notes } = await this.supabase.from('notes').select('*').eq('document_id', documentId);

      return {
        notes,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async getNotesByContainerId(userId: string, containerId: string) {
    try {
      if (!containerId) {
        throw new HttpException('Container id is required', HttpStatus.BAD_REQUEST);
      }
      await this.containersService.verifyUserAccessAndGetContainer(userId, containerId);

      const { data: notes } = await this.supabase
        .from('notes')
        .select('*')
        .eq('container_id', containerId)
        .order('updated_at', { ascending: false });

      return {
        notes,
      };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async deleteNote(userId: string, noteId: string) {
    try {
      if (!noteId) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }
      await this.verifyUserAccessAndGetNote(userId, noteId);

      const { error, status } = await this.supabase.from('notes').delete().eq('id', noteId);
      if (error) {
        console.log(error);
        throw new HttpException(error.message, status);
      }

      return { message: 'Note deleted' };
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  private async verifyUserAccessAndGetNote(userId: string, noteId: string) {
    const note = await this.getNoteById(noteId);
    if (note.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return note;
  }

  private async getNoteById(noteId: string): Promise<any> {
    const { data: notes, error, status } = await this.supabase.from('notes').select('*').eq('id', noteId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!notes || notes.length === 0) {
      throw new HttpException('Note not found', 404);
    }

    return notes[0];
  }

  async getNoteByNoteId(userId: string, noteId: string) {
    try {
      if (!noteId) {
        throw new HttpException('Note id is required', HttpStatus.BAD_REQUEST);
      }

      const { data: notes } = await this.supabase.from('notes').select('*').eq('id', noteId).eq('user_id', userId);

      const note = notes.length > 0 ? notes[0] : null;
      if (!note) {
        throw new HttpException('Not Found', HttpStatus.NOT_FOUND);
      }
      return note;
    } catch (error) {
      console.log(error);
      throw new HttpException(
        error?.message || 'Something went wrong',
        error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
