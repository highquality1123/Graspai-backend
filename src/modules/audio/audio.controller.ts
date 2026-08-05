import { Body, Controller, Get, HttpException, Post, Put, Req, UploadedFiles, UseInterceptors } from '@nestjs/common';
import { ApiBody, ApiConsumes, ApiHeaders, ApiParam, ApiProperty, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { AudioService } from './audio.service';
import { FileFieldsInterceptor } from '@nestjs/platform-express';
import { LanguageEnum } from 'src/modules/documents/model/LanguageEnum';
import { Public } from '../../core/auth/public.decorator';

class RecordingStartBodyDto {
  @ApiProperty({ type: 'string' })
  language: string;
  @ApiProperty({ type: 'string' })
  type: string;
  @ApiProperty({ type: 'string' })
  name: string;
  @ApiProperty({ type: 'string' })
  initialContainerId: string;
}

class RecordingUploadChunkBodyDto {
  @ApiProperty({ type: 'number' })
  start: number;
  @ApiProperty({ type: 'number' })
  end: number;
  @ApiProperty({ type: 'number' })
  index: number;
  @ApiProperty({ type: 'string' })
  isSilent: string;
  @ApiProperty({ type: 'string' })
  language: string;
}

class RecordingUpdateChunkBodyDto {
  @ApiProperty({ type: 'string' })
  text: string;
}

@ApiTags('audio')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('audio')
export class AudioController {
  constructor(
    private readonly audioService: AudioService,
    private readonly sessionService: SessionService,
  ) {}

  @Post('recordings')
  @ApiBody({
    type: RecordingStartBodyDto,
  })
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  async startRecording(@Body() body: RecordingStartBodyDto, @Req() req: Request) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      const recordingId = await this.audioService.startRecording({
        language: body.language as LanguageEnum,
        userId: user.id,
        type: body.type,
        name: body.name,
        initialContainerId: body.initialContainerId,
      });

      return {
        recordingId,
      };
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }

  @Post('/recordings/:recordingId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  @UseInterceptors(
    FileFieldsInterceptor([
      { name: 'chunkRaw', maxCount: 1 },
      { name: 'chunkPlayable', maxCount: 1 },
    ]),
  )
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'recordingId',
    required: true,
  })
  @ApiBody({
    type: RecordingUploadChunkBodyDto,
  })
  async uploadRecordingChunk(
    @UploadedFiles()
    files: {
      chunkRaw?: any[];
      chunkPlayable?: any[];
    },
    @Body()
    body: RecordingUploadChunkBodyDto,
    @Req() req: Request,
  ) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      return await this.audioService.uploadRecordingChunk({
        recordingId: req.params.recordingId,
        userId: user.id,
        chunkRawFile: files.chunkRaw[0],
        chunkPlayableBlob: new Blob([files.chunkPlayable[0].buffer]),
        start: body.start,
        end: body.end,
        index: body.index,
        isSilent: body.isSilent,
        language: body.language,
      });
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }

  @Put('/recordings/chunks/:chunkId')
  public async updateRecordingChunk(@Body() body: RecordingUpdateChunkBodyDto, @Req() req: Request) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      return await this.audioService.updateRecordingChunk({
        chunkId: Number(req.params.chunkId),
        userId: user.id,
        text: body.text,
      });
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }

  @Post('/recordings/:recordingId/stop')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  @ApiConsumes('multipart/form-data')
  @ApiParam({
    name: 'recordingId',
    required: true,
  })
  async stopRecording(@Req() req: Request) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      return await this.audioService.stopRecording({
        recordingId: req.params.recordingId,
        userId: user.id,
      });
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }

  @Get('/recordings')
  public async getMyRecordingsList(@Req() req: Request) {
    try {
      const { user } = await this.sessionService.getUserSession(req);

      if (!user) {
        throw new HttpException('Unauthorized', 401);
      }

      return await this.audioService.getMyRecordingsList({
        userId: user.id,
      });
    } catch (error) {
      throw new HttpException(error?.message ?? 'Internal Server Error', error?.status ?? 500);
    }
  }
}
