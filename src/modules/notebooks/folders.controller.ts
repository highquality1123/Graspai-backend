import { Body, Controller, Delete, HttpCode, Param, ParseUUIDPipe, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuthUser } from '../../core/auth/auth-user';
import { CurrentUser } from '../../core/auth/current-user.decorator';
import { CreateFolderDto } from './model/create-folder.dto';
import { Folder } from './model/notebook.types';
import { UpdateFolderDto } from './model/update-folder.dto';
import { FoldersService } from './folders.service';

@ApiTags('Folders')
@ApiBearerAuth()
@Controller('folders')
export class FoldersController {
  constructor(private readonly folders: FoldersService) {}

  @Post()
  create(@CurrentUser() user: AuthUser, @Body() dto: CreateFolderDto): Promise<Folder> {
    return this.folders.create(user.userId, dto.label);
  }

  @Patch(':folderId')
  update(
    @CurrentUser() user: AuthUser,
    @Param('folderId', ParseUUIDPipe) folderId: string,
    @Body() dto: UpdateFolderDto,
  ): Promise<Folder> {
    return this.folders.update(user.userId, folderId, dto.label);
  }

  @Delete(':folderId')
  @HttpCode(204)
  remove(@CurrentUser() user: AuthUser, @Param('folderId', ParseUUIDPipe) folderId: string): Promise<void> {
    return this.folders.deleteAndDetach(user.userId, folderId);
  }
}
