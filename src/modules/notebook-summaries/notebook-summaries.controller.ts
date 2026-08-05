import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { JobAccepted } from '../jobs/job-queue';
import { GenerateSummaryDto } from './model/generate-summary.dto';
import { NotebookSummary } from './model/summary.types';
import { NotebookSummariesService } from './notebook-summaries.service';

@ApiTags('Summaries')
@ApiBearerAuth()
@Controller('notebooks/:notebookId/summaries')
export class NotebookSummariesController {
  constructor(private readonly summaries: NotebookSummariesService) {}

  @Post('generate')
  @HttpCode(202)
  generate(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Body() dto: GenerateSummaryDto,
  ): Promise<JobAccepted> {
    return this.summaries.generate(user.userId, notebookId, dto);
  }

  @Get()
  list(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
  ): Promise<NotebookSummary[]> {
    return this.summaries.list(user.userId, notebookId);
  }

  @Get(':summaryId')
  get(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
  ): Promise<NotebookSummary> {
    return this.summaries.get(user.userId, notebookId, summaryId);
  }

  @Delete(':summaryId')
  @HttpCode(204)
  remove(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Param('summaryId', ParseUUIDPipe) summaryId: string,
  ): Promise<void> {
    return this.summaries.softDelete(user.userId, notebookId, summaryId);
  }
}
