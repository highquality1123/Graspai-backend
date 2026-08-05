import { Body, Controller, Delete, Get, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { CreateNotebookDto } from './model/create-notebook.dto';
import { MoveNotebookDto } from './model/move-notebook.dto';
import { Notebook, NotebookDetail, NotebookTree } from './model/notebook.types';
import { UpdateNotebookDto } from './model/update-notebook.dto';
import { NotebooksService } from './notebooks.service';

@ApiTags('Notebooks')
@ApiBearerAuth()
@Controller('notebooks')
export class NotebooksController {
  constructor(private readonly notebooks: NotebooksService) {}

  @Get()
  getTree(@CurrentUser() user: AuthUser): Promise<NotebookTree> {
    return this.notebooks.getTree(user.userId);
  }

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateNotebookDto): Promise<Notebook> {
    return this.notebooks.create(user.userId, dto);
  }

  @Get(':notebookId')
  getDetail(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
  ): Promise<NotebookDetail> {
    return this.notebooks.getDetail(user.userId, notebookId);
  }

  @Patch(':notebookId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Body() dto: UpdateNotebookDto,
  ): Promise<Notebook> {
    return this.notebooks.update(user.userId, notebookId, dto);
  }

  @Delete(':notebookId')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('notebookId', ParseUUIDPipe) notebookId: string): Promise<void> {
    return this.notebooks.softDelete(user.userId, notebookId);
  }

  @Patch(':notebookId/pin')
  togglePin(@CurrentUser() user: AuthUser, @Param('notebookId', ParseUUIDPipe) notebookId: string): Promise<Notebook> {
    return this.notebooks.togglePin(user.userId, notebookId);
  }

  @Patch(':notebookId/move')
  move(
    @CurrentUser() user: AuthUser,
    @Param('notebookId', ParseUUIDPipe) notebookId: string,
    @Body() dto: MoveNotebookDto,
  ): Promise<Notebook> {
    return this.notebooks.move(user.userId, notebookId, dto.folderId);
  }
}
