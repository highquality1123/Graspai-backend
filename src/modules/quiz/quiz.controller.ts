import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import { QuizService } from './quiz.service';
import { SessionService } from '../session/session.service';
import { CreateQuizRequestDto } from './model/CreateQuizRequestDto';
import { PassQuizRequestDto } from './model/PassQuizRequestDto';
import { CreateGeneralQuizRequestDto } from './model/CreateGeneralQuizRequestDto';
import { Public } from '../../core/auth/public.decorator';

// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('quizzes')
export class QuizController {
  public constructor(
    private readonly quizService: QuizService,
    private readonly sessionService: SessionService,
  ) {}

  @Post()
  public async generateQuiz(@Body() createQuizRequest: CreateQuizRequestDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return await this.quizService.generateQuiz(user.id, createQuizRequest);
  }

  @Post('/general')
  public async generateGeneralQuiz(@Body() createGeneralQuizRequest: CreateGeneralQuizRequestDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return await this.quizService.generateGeneralQuiz(user.id, createGeneralQuizRequest);
  }

  @Get('/document/:documentId')
  public async getQuizzesByDocumentId(@Req() req: Request, @Param() { documentId }: { documentId: string }) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return await this.quizService.getQuizzesByDocumentId(user.id, documentId);
  }

  @Delete(':quizId')
  public async deleteQuiz(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const quizId = req.params.quizId;
    return await this.quizService.deleteQuiz(user.id, quizId);
  }

  @Post(':quizId')
  public async passQuiz(@Body() passQuizRequest: PassQuizRequestDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const quizId = req.params.quizId;
    return await this.quizService.passQuiz(user.id, quizId, passQuizRequest);
  }

  @Get(':quizId')
  public async getQuizHistory(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);

    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const quizId = req.params.quizId;
    return await this.quizService.getQuizHistory(user.id, quizId);
  }
}
