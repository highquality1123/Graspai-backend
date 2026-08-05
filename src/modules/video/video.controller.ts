import { Body, Controller, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiHeaders, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { VideoService } from './video.service';
import { VideoCreateFromLinkDto } from './model/VideoCreateFromLinkDto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('video')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('video')
export class VideoController {
  constructor(
    private readonly videoService: VideoService,
    private readonly sessionService: SessionService,
  ) {}

  @Post()
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  async createDocumentFromVideoLink(@Body() body: VideoCreateFromLinkDto, @Req() req: Request) {
    try {
      const { user: u } = await this.sessionService.getUserSession(req);
      if (!u) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }
      const user = { ...u, ...u.profile };

      const { document } = await this.videoService.createDocumentFromVideoLink(body, user);

      return {
        document,
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
