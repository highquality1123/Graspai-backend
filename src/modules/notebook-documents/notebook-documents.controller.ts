import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiBody, ApiConsumes, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { DocumentJobAccepted, NotebookDocument } from './model/document.types';
import { IngestUrlDto } from './model/ingest-url.dto';
import { UpdateDocumentDto } from './model/update-document.dto';
import { UploadDocumentDto } from './model/upload-document.dto';
import { NotebookDocumentsService } from './notebook-documents.service';

@ApiTags('Documents')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/documents')
export class NotebookDocumentsController {
  constructor(private readonly documents: NotebookDocumentsService) {}

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
  ): Promise<NotebookDocument[]> {
    return this.documents.list(user.userId, notebookId);
  }

  @Post()
  @HttpCode(202)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({ description: 'Fichier + métadonnées (openapi.yaml → uploadDocument)', type: UploadDocumentDto })
  upload(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @UploadedFile() file: Express.Multer.File | undefined,
    @Body() dto: UploadDocumentDto,
  ): Promise<DocumentJobAccepted> {
    return this.documents.upload(user.userId, notebookId, file, dto);
  }

  @Post('url')
  @HttpCode(202)
  ingestUrl(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Body() dto: IngestUrlDto,
  ): Promise<DocumentJobAccepted> {
    return this.documents.ingestUrl(user.userId, notebookId, dto);
  }

  @Delete(':documentId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
  ): Promise<void> {
    return this.documents.remove(user.userId, notebookId, documentId);
  }

  @Patch(':documentId')
  rename(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('documentId', ParseUUIDPipe) documentId: string,
    @Body() dto: UpdateDocumentDto,
  ): Promise<NotebookDocument> {
    return this.documents.rename(user.userId, notebookId, documentId, dto);
  }
}
