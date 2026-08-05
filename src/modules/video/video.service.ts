import { HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { HttpService } from '@nestjs/axios';
import { SupabaseClient } from '@supabase/supabase-js';
import { StatsService } from '../stats/stats.service';
import { VideoCreateFromLinkDto } from './model/VideoCreateFromLinkDto';
import { catchError, firstValueFrom } from 'rxjs';
import { AxiosError, HttpStatusCode } from 'axios';
import { DocumentsService } from '../documents/documents.service';
import { DocumentTypeEnum } from '../documents/model/DocumentTypeEnum';
import { IUserDTO } from '../auth/model/login.dto';
import { LanguageEnum } from '../documents/model/LanguageEnum';
import { VideoTranscriptResponseDto } from './model/VideoTranscriptResponseDto';
import { DocumentDto } from '../documents/model/DocumentDto';
import { ContainersService } from '../containers/containers.service';
import { AiService } from '../ai/ai.service';
import { DocumentSourceTypeEnum } from '../documents/model/DocumentSourceTypeEnum';
import { VideoCreateFromLinkDtoContent } from './model/VideoCreateFromLinkDtoContent';
import { VideoDetailsDto } from './model/VideoDetailsDto';
import * as moment from 'moment';
import { SupabaseService } from '../supabase/supabase.service';

const CHUNK_DURATION_SECONDS = 30;

@Injectable()
export class VideoService {
  private supabase: SupabaseClient;

  constructor(
    private readonly statsService: StatsService,
    private readonly httpService: HttpService,
    private readonly documentsService: DocumentsService,
    private readonly containersService: ContainersService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async createDocumentFromVideoLink(
    body: VideoCreateFromLinkDto,
    user: IUserDTO,
  ): Promise<{
    message: string;
    document: DocumentDto;
  }> {
    await this.containersService.verifyUserAccessAndGetContainer(user.id, body.containerId);

    await this.statsService.registerVideoUsage(user.id);

    const videoId = this.extractVideoId(body.link);
    if (!videoId) {
      throw new HttpException('Unable to extract video ID from the link', HttpStatus.BAD_REQUEST);
    }

    const videoDetails = await this.getVideoDetails(videoId);
    let title = videoDetails.title;
    if (!title) {
      title = 'YouTube Video';
    }

    const videoTranscript = await this.getVideoTranscript(videoId, videoDetails.defaultLanguage);
    if (videoTranscript.error) {
      throw new HttpException(
        videoTranscript.message || 'No transcript is available for this video',
        HttpStatus.NOT_FOUND,
      );
    }

    const videoMunitesCount = videoDetails.duration / 60;
    await this.statsService.registerVideoMinutesUsage(user.id, videoMunitesCount);

    let lang: LanguageEnum;
    if (videoTranscript.lang.startsWith('en')) {
      lang = LanguageEnum.EN;
    } else if (videoTranscript.lang.startsWith('fr')) {
      lang = LanguageEnum.FR;
    } else {
      throw new HttpException('Unsupported language of the video', HttpStatus.BAD_REQUEST);
    }

    return await this.createDocumentFromVideo(
      title,
      body.link,
      user,
      lang,
      body.containerId,
      videoTranscript,
      videoDetails.duration,
    );
  }

  private extractVideoId(link: string): string | null {
    const regExp =
      /^(?:https?:\/\/)?(?:www\.)?(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i;
    const match = link.match(regExp);
    return match ? match[1] : null;
  }

  private async getVideoDetails(videoId: string): Promise<VideoDetailsDto> {
    const apiUrl = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&key=${process.env.GOOGLE_YOUTUBE_API_KEY}&part=snippet,contentDetails`;
    const { data } = await firstValueFrom(
      this.httpService
        .get<{
          items: [{ snippet: { title: string; defaultLanguage: string }; contentDetails: { duration: string } }];
        }>(apiUrl, {
          headers: {
            Accept: 'application/json',
          },
        })
        .pipe(
          catchError((error: AxiosError) => {
            throw new HttpException(
              'Google API Error: ' + error?.message,
              error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }),
        ),
    );
    return {
      title: data?.items[0]?.snippet?.title,
      duration: moment.duration(data?.items[0]?.contentDetails?.duration || 0).asSeconds(),
      defaultLanguage: data?.items[0]?.snippet?.defaultLanguage,
    };
  }

  private async getVideoTranscript(videoId: string, language: string): Promise<VideoTranscriptResponseDto> {
    let apiUrl = `https://api.supadata.ai/v1/youtube/transcript?videoId=${videoId}`;
    if (language) {
      apiUrl += `&lang=${language}`;
    }

    const { data } = await firstValueFrom(
      this.httpService
        .get<VideoTranscriptResponseDto>(apiUrl, {
          headers: {
            'x-api-key': process.env.SUPADATA_AI_KEY,
          },
        })
        .pipe(
          catchError((error: AxiosError) => {
            throw new HttpException(
              'Supadata API Error: ' + error?.message,
              error?.status || HttpStatus.INTERNAL_SERVER_ERROR,
            );
          }),
        ),
    );
    return data;
  }

  private async createDocumentFromVideo(
    documentName: string,
    documentUrl: string,
    user: IUserDTO,
    language: LanguageEnum,
    containerId: string,
    videoTranscript: VideoTranscriptResponseDto,
    videoDurationSeconds: number,
  ): Promise<{
    message: string;
    document: DocumentDto;
  }> {
    try {
      console.time('Create document from video');

      let document = await this.documentsService.saveDocumentMeta(
        user.id,
        documentName,
        documentUrl,
        DocumentTypeEnum.VIDEO,
        language,
        containerId,
      );

      await this.aiService.buildEmbeddings(
        user.id,
        document,
        DocumentSourceTypeEnum.VIDEO,
        videoTranscript,
        async (document: DocumentDto, source: VideoTranscriptResponseDto) => {
          this.fixChunksDurations(source);
          return await this.getVideoChunks(document, source);
        },
      );

      document = await this.saveDurationIntoDocumentLength(videoDurationSeconds, document, user);

      console.timeEnd('Create document from video');

      return {
        message: 'Document created successfully',
        document,
      };
    } catch (error) {
      throw new HttpException(error.message || 'Unknown error', error.status || HttpStatusCode.InternalServerError);
    }
  }

  private async saveDurationIntoDocumentLength(videoDurationSeconds: number, document: DocumentDto, user: IUserDTO) {
    const updateDocumentQueryResult = await this.supabase
      .from('documents')
      .update({
        length: videoDurationSeconds || 0,
      })
      .eq('id', document.id)
      .eq('user_id', user.id)
      .select()
      .single();
    if (updateDocumentQueryResult.error) {
      console.log('[Documents] Document update failed', updateDocumentQueryResult.error);
      throw new HttpException(updateDocumentQueryResult.error.message, updateDocumentQueryResult.status);
    }
    return updateDocumentQueryResult.data;
  }

  private fixChunksDurations(source: VideoTranscriptResponseDto) {
    let offsetPrev = null;
    source.content.forEach((segment: VideoCreateFromLinkDtoContent, index) => {
      if (offsetPrev !== null) {
        source.content[index - 1].duration = segment.offset - offsetPrev;
      }
      offsetPrev = segment.offset;
    });
  }

  private async getVideoChunks(document: DocumentDto, videoTranscript: VideoTranscriptResponseDto) {
    const mergedChunks = [];
    let chunkContent = '';
    let chunkDuration = 0;
    let chunkStart = 0;
    let chunkEnd = 0;
    videoTranscript.content.forEach((segment: VideoCreateFromLinkDtoContent) => {
      if (chunkDuration == 0) {
        chunkStart = segment.offset / 1000;
      }
      chunkEnd = (segment.offset + segment.duration) / 1000;
      chunkContent += segment.text + ' ';
      chunkDuration += segment.duration / 1000;
      if (chunkDuration >= CHUNK_DURATION_SECONDS) {
        mergedChunks.push({
          content: chunkContent,
          page: mergedChunks.length + 1,
          doc_id: document.id,
          duration: chunkDuration,
          start: chunkStart,
          end: chunkEnd,
        });
        chunkContent = '';
        chunkDuration = 0;
        chunkStart = 0;
        chunkEnd = 0;
      }
    });
    if (chunkDuration != 0) {
      mergedChunks.push({
        content: chunkContent,
        page: mergedChunks.length + 1,
        doc_id: document.id,
        duration: chunkDuration,
        start: chunkStart,
        end: chunkEnd,
      });
    }
    return mergedChunks;
  }
}
