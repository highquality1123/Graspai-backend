import { Body, Controller, Delete, Get, HttpException, HttpStatus, Post, Put, Req } from '@nestjs/common';
import { ApiHeaders, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { FoldersService } from './folders.service';
import { CreateFolderDto } from './model/CreateFolderDto';
import { UpdateFolderDto } from './model/UpdateFolderDto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('folders')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('folders')
export class FoldersController {
  constructor(
    private readonly foldersService: FoldersService,
    private readonly sessionService: SessionService,
  ) {}

  @Get('tree')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async getFolderTree(@Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.foldersService.getUserFolderTree(user.id);
  }

  @Get('/:folderId')
  async getFolderById(@Req() req: Request) {
    const { user: user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    try {
      return this.foldersService.getFolderById(user.id, req.params.folderId);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post()
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async createFolder(@Body() createFolderDto: CreateFolderDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.foldersService.createFolder(user.id, createFolderDto);
  }

  @Put(':folderId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async updateFolderName(@Req() req: Request, @Body() updateFolderDto: UpdateFolderDto) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const folderId = req.params.folderId;
    return this.foldersService.updateFolderName(user.id, folderId, updateFolderDto);
  }

  @Delete(':folderId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  @ApiParam({
    name: 'folderId',
    required: true,
  })
  async deleteFolder(@Req() req: Request) {
    try {
      const userSession = await this.sessionService.getUserSession(req);
      if (!userSession.user) {
        throw new HttpException('Unauthorized', 401);
      }

      await this.foldersService.deleteFolder(userSession.user.profile.id, req.params.folderId);

      return {
        message: 'Folder deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
