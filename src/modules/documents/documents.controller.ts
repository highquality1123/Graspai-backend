import {
  Controller,
  Body,
  Delete,
  Get,
  Post,
  HttpException,
  HttpStatus,
  Req,
  UseInterceptors,
  UploadedFile,
  Put,
  Param,
} from '@nestjs/common';
import { ApiBody, ApiHeaders, ApiParam, ApiTags, ApiConsumes } from '@nestjs/swagger';
import { Request } from 'express';
import { DocumentsService } from './documents.service';
import { SessionService } from '../session/session.service';
import { FileInterceptor } from '@nestjs/platform-express';
import { FileUploadDto } from './model/FileUploadDto';
import { ChatService } from '../chat/chat.service';
import { RenameDocumentDto } from './model/RenameDocumentDto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('documents')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('documents')
export class DocumentsController {
  constructor(
    private readonly documentsService: DocumentsService,
    private readonly chatService: ChatService,
    private readonly sessionService: SessionService,
  ) {}

  @Get()
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  async getDocuments(@Req() req: Request) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      return await this.documentsService.getDocumentsByUserId(user.id);
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }

  @Get('/:documentId')
  async getDocumentById(@Req() req: Request) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    try {
      return this.documentsService.getDocumentById(user.id, req.params.documentId);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload your file here',
    type: FileUploadDto,
  })
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  async createFromFile(@UploadedFile() file: any, @Body() body: FileUploadDto, @Req() req: Request) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = { ...u, ...u.profile };

    try {
      const result = await this.documentsService.createFromFile(
        file,
        body.documentName,
        body.documentType,
        user,
        body.language,
        body.containerId,
      );
      return result;
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Get('/:documentId/chats')
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
  async getDocumentChats(@Req() req: Request) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    try {
      return this.chatService.getChatsByDocumentId(user.id, req.params.documentId);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Put(':documentId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async renameDocument(
    @Param('documentId') documentId: string,
    @Body() renameDocumentDto: RenameDocumentDto,
    @Req() req: Request,
  ) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.documentsService.renameDocument(user.id, documentId, renameDocumentDto);
  }

  @Delete('/:documentId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  @ApiParam({
    name: 'documentId',
    required: true,
  })
  async deleteDocument(@Req() req: Request) {
    try {
      const userSession = await this.sessionService.getUserSession(req);

      if (!userSession.user) {
        throw new HttpException('Unauthorized', 401);
      }

      await this.documentsService.deleteDocument(userSession.user.profile.id, req.params.documentId);

      return {
        message: 'Document deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
