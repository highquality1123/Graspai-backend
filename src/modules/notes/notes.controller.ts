import { Body, Controller, Delete, Get, HttpException, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiHeaders, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { NotesService } from './notes.service';
import { CreateNoteDto } from './model/CreateNote.dto';
import { UpdateNoteDto } from './model/UpdateNote.dto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('notes')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('notes')
export class NotesController {
  public constructor(
    private readonly notesService: NotesService,
    private readonly sessionService: SessionService,
  ) {}

  @Get(':noteId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'noteId',
    required: true,
  })
  public async getNoteById(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const noteId = req.params.noteId as string;
    return await this.notesService.getNoteByNoteId(user.id, noteId);
  }

  @Post()
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: {
          type: 'string',
        },
        content: {
          type: 'string',
        },
        documentId: {
          type: 'string',
        },
        containerId: {
          type: 'string',
        },
      },
    },
  })
  public async createNote(@Body() body: CreateNoteDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    return await this.notesService.create(user.id, body);
  }

  @Put()
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        id: {
          type: 'string',
        },
        title: {
          type: 'string',
        },
        content: {
          type: 'string',
        },
      },
    },
  })
  public async updateNote(@Body() body: UpdateNoteDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    return await this.notesService.update(user.id, body);
  }

  @Get('/document/:documentId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'documentId',
    required: true,
  })
  public async getNotesByDocumentId(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const documentId = req.params.documentId as string;
    return await this.notesService.getNotesByDocumentId(user.id, documentId);
  }

  @Get('/containers/:containerId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'containerId',
    required: true,
  })
  public async getNotesByContainerId(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const containerId = req.params.containerId as string;
    return await this.notesService.getNotesByContainerId(user.id, containerId);
  }

  @Delete(':noteId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'noteId',
    required: true,
  })
  public async deleteNote(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const noteId = req.params.noteId;
    return await this.notesService.deleteNote(user.id, noteId);
  }
}
