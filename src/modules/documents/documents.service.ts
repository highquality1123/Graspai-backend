import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { IUserDTO } from 'src/modules/auth/model/login.dto';
import { DocumentDto } from 'src/modules/documents/model/DocumentDto';
import { HttpStatusCode } from 'axios';
import { S3Service } from '../s3/s3.service';
import { v4 } from 'uuid';
import { DocumentTypeEnum } from 'src/modules/documents/model/DocumentTypeEnum';
import { LanguageEnum } from 'src/modules/documents/model/LanguageEnum';
import generator from 'src/services/generator';
import { DocumentSourceTypeEnum } from 'src/modules/documents/model/DocumentSourceTypeEnum';
import { StatsService } from '../stats/stats.service';
import { WebPDFLoader } from 'langchain/document_loaders/web/pdf';
import { AiService } from '../ai/ai.service';
import { PdfService } from '../pdf/pdf.service';
import { RenameDocumentDto } from './model/RenameDocumentDto';
import { AudioService } from '../audio/audio.service';
import { ChapterDto } from './model/ChapterDto';
import { SupabaseService } from '../supabase/supabase.service';

@Injectable()
export class DocumentsService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly s3Service: S3Service,
    private readonly statsService: StatsService,
    private readonly aiService: AiService,
    private readonly pdfService: PdfService,
    private readonly audioService: AudioService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async getDocumentsByUserId(userId: string) {
    const documentsQueryResult = await this.supabase
      .from('documents')
      .select('*, embeddings(id)')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });

    if (documentsQueryResult.error) {
      throw new HttpException(documentsQueryResult.error.message, documentsQueryResult.status);
    }

    documentsQueryResult.data = documentsQueryResult.data
      .filter((row) => {
        return row.embeddings.length !== 0;
      })
      .map((row) => {
        delete row.embeddings;
        return row;
      });

    return documentsQueryResult.data as DocumentDto[];
  }

  public async createFromFile(
    file: any,
    documentName: string,
    documentType: DocumentTypeEnum,
    user: IUserDTO,
    language: LanguageEnum,
    containerId: string,
  ): Promise<{
    message: string;
    document: DocumentDto;
  }> {
    try {
      console.time('Create document from file');
      if (documentType !== DocumentTypeEnum.PDF && documentType !== DocumentTypeEnum.AUDIO) {
        throw new HttpException('Only PDF or AUDIO is allowed to be uploaded as a file', HttpStatus.BAD_REQUEST);
      }

      const normalizedLanguage = this.normalizeDocumentLanguage(language);
      this.validateLanguage(normalizedLanguage);
      await this.validateUsageLimits(user.id, file, documentType);

      const fileName = generator.generateFileName(file.originalname);
      const fileUrl = this.s3Service.buildUrlByFileName(fileName);

      await this.s3Service.uploadFile(file, fileName);
      const document = await this.saveDocumentMeta(user.id, documentName, fileUrl, documentType, normalizedLanguage, containerId);

      if (documentType === DocumentTypeEnum.PDF) {
        await this.aiService.buildEmbeddings(
          user.id,
          document,
          DocumentSourceTypeEnum.FILE,
          file,
          async (document: DocumentDto, source: any) => {
            return await this.pdfService.getPdfChunks(source, document.id);
          },
        );
      } else if (documentType == DocumentTypeEnum.AUDIO) {
        await this.aiService.buildEmbeddings(
          user.id,
          document,
          DocumentSourceTypeEnum.AUDIO,
          file,
          async (document: DocumentDto, source: any) => {
            return await this.audioService.transcribeAndGetAudioChunks(
              source,
              document.id,
              document.language as LanguageEnum,
            );
          },
        );
        await this.aiService.generateChapters(user.id, document.id);
      }

      console.timeEnd('Create document from file');

      return {
        message: 'Document uploaded successfully',
        document,
      };
    } catch (error) {
      console.timeEnd('Create document from file');

      throw new HttpException(
        error.message ?? error.response?.data?.error?.message ?? 'Unknown error',
        error.status || HttpStatusCode.InternalServerError,
      );
    }
  }

  private normalizeDocumentLanguage(language: LanguageEnum | string | undefined): LanguageEnum {
    const s = typeof language === 'string' ? language.trim().toLowerCase() : '';
    const found = (Object.values(LanguageEnum) as LanguageEnum[]).find((code) => code === s);
    return found ?? LanguageEnum.EN;
  }

  private validateLanguage(language: LanguageEnum) {
    if (!Object.values(LanguageEnum).includes(language)) {
      throw new HttpException('Bad language specified', HttpStatus.BAD_REQUEST);
    }
  }

  private validateDocument(file: any, documentType: DocumentTypeEnum) {
    switch (documentType) {
      case DocumentTypeEnum.PDF:
        if (!['application/pdf'].includes(file.mimetype)) {
          throw new HttpException('Only PDF files are allowed', HttpStatus.BAD_REQUEST);
        }
        break;
      case DocumentTypeEnum.AUDIO:
        if (file.size >= 25 * 1024 * 1024) {
          throw new HttpException('Audio files only up to 25Mb are supported', HttpStatus.BAD_REQUEST);
        }
        if (
          ![
            'audio/flac',
            'audio/x-flac',
            'audio/m4a',
            'audio/x-m4a',
            'audio/mp4',
            'video/mp4',
            'audio/mpeg',
            'audio/x-mpegurl',
            'video/mpeg',
            'audio/ogg',
            'video/ogg',
            'application/ogg',
            'audio/x-opus+ogg',
            'audio/wav',
            'audio/x-wav',
            'audio/webm',
            'video/webm',
          ].includes(file.mimetype)
        ) {
          throw new HttpException(
            'Only flac, mp3, mp4, mpeg, mpga, m4a, ogg, wav or webm files are allowed. ' + file.mimetype + ' used.',
            HttpStatus.BAD_REQUEST,
          );
        }
        break;
      case DocumentTypeEnum.VIDEO:
        throw new HttpException('Not implemented', HttpStatus.BAD_REQUEST);
        break;
      default:
        throw new HttpException('Bad documentType specified', HttpStatus.BAD_REQUEST);
    }
  }

  private async validateUsageLimits(userId: string, file: any, documentType: DocumentTypeEnum) {
    if (documentType === DocumentTypeEnum.PDF) {
      const fileBlob = new Blob([file.buffer]);
      const loader = new WebPDFLoader(fileBlob, {
        splitPages: true,
        parsedItemSeparator: '',
      });
      const pages = await loader.load();
      await this.statsService.registerPdfUsage(userId);
      await this.statsService.registerPdfPagesUsage(userId, pages.length);
    } else if (documentType === DocumentTypeEnum.AUDIO) {
      const audioDurationSeconds = await this.audioService.getAudioDurationSeconds(file);
      console.log('Audio duration = ', audioDurationSeconds, ' seconds');
      await this.statsService.registerAudioUsage(userId);
      await this.statsService.registerTranscriptionMinutesUsage(userId, audioDurationSeconds / 60.0);
    }
  }

  public async saveDocumentMeta(
    userId: string,
    documentName: string,
    fileUrl: string,
    documentType: DocumentTypeEnum,
    language: LanguageEnum,
    containerId: string,
  ) {
    const documentId = v4();

    const newDocument = {
      id: documentId,
      user_id: userId,
      name: documentName,
      pages_count: 0,
      length: 0,
      tokens: 0,
      url: fileUrl,
      type: documentType,
      language: language,
      container_id: containerId,
    };

    const {
      error: documentError,
      status: documentStatus,
      data: createdDocuments,
    } = await this.supabase.from('documents').insert([newDocument]).select();
    if (documentError) {
      console.log('[Documents] Insert document failed', documentError);
      throw new HttpException(documentError?.message, documentStatus);
    }

    const createdDocument = createdDocuments[0] as DocumentDto;

    return createdDocument;
  }

  public async deleteDocument(userId: string, documentId: string) {
    try {
      const document = await this.verifyUserAccessAndGetDocument(userId, documentId);

      const documentDeleteQueryResult = await this.supabase
        .from('documents')
        .delete()
        .eq('id', documentId)
        .eq('user_id', userId);
      if (documentDeleteQueryResult.error) {
        console.log(
          '[Documents] DELETE Document Error: ',
          documentDeleteQueryResult.error.message,
          documentDeleteQueryResult.status,
        );
        throw new HttpException(documentDeleteQueryResult.error.message, documentDeleteQueryResult.status);
      }

      await this.s3Service.deleteFile(document.url);

      return { message: 'Document deleted' };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  public async verifyUserAccessAndGetDocument(userId: string, documentId: string) {
    const document = await this.getDocumentByIdInternal(documentId);
    if (document.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return document;
  }

  private async getDocumentByIdInternal(documentId: string): Promise<DocumentDto> {
    const { data: documents, error, status } = await this.supabase.from('documents').select('*').eq('id', documentId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!documents || documents.length === 0) {
      throw new HttpException('Document not found', 404);
    }

    return documents[0];
  }

  public async getDocumentById(userId: string, documentId: string): Promise<DocumentDto> {
    const document = await this.verifyUserAccessAndGetDocument(userId, documentId);

    if (document.type == DocumentTypeEnum.AUDIO || document.type == DocumentTypeEnum.VIDEO) {
      const pages = await this.supabase
        .from('embeddings')
        .select('content, metadata->start, metadata->end')
        .match({ document_id: documentId })
        .order('metadata->page_number', { ascending: true });
      document.pages = pages.data;

      const chapters = await this.supabase.from('chapters').select('chapters').match({ document_id: documentId });
      if (!chapters || !chapters.data?.length) {
        await this.aiService.generateChapters(userId, documentId);
      }
      document.chapters = chapters.data[0]?.chapters as ChapterDto[];
    }

    return document;
  }

  public async getDocumentsByContainerId(containerId: string) {
    const { data: documents, error } = await this.supabase
      .from('documents')
      .select('*')
      .eq('container_id', containerId)
      .order('created_at', { ascending: false });

    if (error) {
      throw new HttpException(error.message, HttpStatus.BAD_REQUEST);
    }
    return documents || [];
  }

  public async deleteAllDocumentsInContainer(userId: string, containerId: string) {
    const {
      data: documents,
      error,
      status,
    } = await this.supabase.from('documents').select('*').eq('container_id', containerId);

    for (const document of documents) {
      try {
        await this.deleteDocument(userId, document.id);
      } catch (deleteError) {
        throw new HttpException(
          `Failed to delete container with ID ${document.id}: ${deleteError.message}`,
          HttpStatus.INTERNAL_SERVER_ERROR,
        );
      }
    }
  }

  public async renameDocument(userId: string, documentId: string, renameDocumentDto: RenameDocumentDto) {
    try {
      const document = await this.verifyUserAccessAndGetDocument(userId, documentId);
      const { error: updateError, data: updatedDocument } = await this.supabase
        .from('documents')
        .update({
          name: renameDocumentDto.name,
        })
        .eq('id', document.id)
        .select();

      if (updateError) {
        throw new HttpException(updateError.message, HttpStatus.INTERNAL_SERVER_ERROR);
      }

      return updatedDocument?.[0];
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
