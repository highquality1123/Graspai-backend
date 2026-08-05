import { Controller, Get, Param, ParseUUIDPipe } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JobsService } from './jobs.service';
import { Job } from './model/job.types';

@ApiTags('Jobs')
@ApiBearerAuth()
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get(':jobId')
  @ApiOperation({ summary: 'État d’un traitement asynchrone (polling unifié)' })
  getJob(@CurrentUser() user: AuthUser, @Param('jobId', new ParseUUIDPipe()) jobId: string): Promise<Job> {
    return this.jobs.getForUser(user.userId, jobId);
  }
}
