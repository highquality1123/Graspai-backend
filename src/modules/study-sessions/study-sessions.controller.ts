import { Body, Controller, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { CreateStudySessionDto } from './model/create-study-session.dto';
import { StudySession } from './model/study-session.types';
import { StudySessionsService } from './study-sessions.service';

@ApiTags('Study Sessions')
@ApiBearerAuth()
@Controller('study-sessions')
export class StudySessionsController {
  constructor(private readonly studySessions: StudySessionsService) {}

  @Post()
  log(@CurrentUser() user: AuthUser, @Body() dto: CreateStudySessionDto): Promise<StudySession> {
    return this.studySessions.log(user.userId, dto);
  }
}
