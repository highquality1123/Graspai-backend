import { Controller, Get, Post, Body, Param, Delete, Req, HttpException, HttpStatus } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { SessionService } from '../session/session.service';
import { Request } from 'express';
import { GenerateFlashcardsSetRequestDto } from './model/GenerateFlashcardsSetRequestDto';
import { SaveFlashcardsSetRequestDto } from './model/SaveFlashcardsSetRequestDto';
import { Public } from '../../core/auth/public.decorator';

// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('flashcards')
export class FlashcardsController {
  public constructor(
    private readonly flashcardsService: FlashcardsService,
    private readonly sessionService: SessionService,
  ) {}

  @Post()
  public async generateFlashcardsSet(
    @Body() generateFlashcardsSetRequestDto: GenerateFlashcardsSetRequestDto,
    @Req() req: Request,
  ) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.flashcardsService.generateFlashcardsSet(user.id, generateFlashcardsSetRequestDto);
  }

  @Post('manual')
  public async saveFlashcardsSet(
    @Body() saveFlashcardsSetRequestDto: SaveFlashcardsSetRequestDto,
    @Req() req: Request,
  ) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.flashcardsService.saveFlashcardsSet(user.id, saveFlashcardsSetRequestDto);
  }

  @Get('document/:documentId')
  public async getFlashcardsSetsByDocumentId(@Req() req: Request, @Param() { documentId }: { documentId: string }) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.flashcardsService.getFlashcardsSetsByDocumentId(user.id, documentId);
  }

  @Post(':setId/review')
  public async reviewFlashcards(@Req() req: Request, @Param() { setId }: { setId: number }) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.flashcardsService.reviewFlashcardsSet(user.id, setId);
  }

  @Delete(':setId')
  public async remove(@Req() req: Request, @Param() { setId }: { setId: number }) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.flashcardsService.deleteFlashcardsSet(user.id, setId);
  }
}
