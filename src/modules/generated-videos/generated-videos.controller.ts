import { Body, Controller, Delete, Get, HttpException, Post, Put, Req } from '@nestjs/common';
import { ApiBody, ApiHeaders, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { GeneratedVideosService } from './generated-videos.service';
import { CreateGeneratedVideoDto } from './model/CreateGeneratedVideo.dto';
import { UpdateGeneratedVideoDto } from './model/UpdateGeneratedVideo.dto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('generated-videos')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('generated-videos')
export class GeneratedVideosController {
  public constructor(
    private readonly generatedVideosService: GeneratedVideosService,
    private readonly sessionService: SessionService,
  ) {}

  @Get(':videoUuid')
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
    name: 'videoUuid',
    required: true,
  })
  public async getVideoById(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const videoUuid = req.params.videoUuid as string;
    return await this.generatedVideosService.getVideoById(user.id, videoUuid);
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
        user_query: {
          type: 'string',
          description: 'The user query for video generation',
        },
        document_id: {
          type: 'string',
          description: 'The document ID to associate with the video',
        },
      },
      required: ['user_query', 'document_id'],
    },
  })
  public async createVideo(@Body() body: CreateGeneratedVideoDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    return await this.generatedVideosService.create(user.id, body);
  }

  @Put(':videoUuid')
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
    name: 'videoUuid',
    required: true,
  })
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        name: {
          type: 'string',
          description: 'The video name',
        },
      },
    },
  })
  public async updateVideo(@Body() body: UpdateGeneratedVideoDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const videoUuid = req.params.videoUuid as string;
    return await this.generatedVideosService.update(user.id, { ...body, uuid: videoUuid });
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
  public async getVideosByDocumentId(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const documentId = req.params.documentId as string;
    return await this.generatedVideosService.getVideosByDocumentId(user.id, documentId);
  }

  @Delete(':videoUuid')
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
    name: 'videoUuid',
    required: true,
  })
  public async deleteVideo(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', 401);
    }

    const videoUuid = req.params.videoUuid;
    return await this.generatedVideosService.deleteVideo(user.id, videoUuid);
  }
}
