import { Body, Controller, Delete, Get, HttpException, HttpStatus, Param, Post, Put, Req } from '@nestjs/common';
import { ApiHeaders, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { SessionService } from '../session/session.service';
import { ContainersService } from './containers.service';
import { CreateContainerDto } from './model/CreateContainerDto';
import { MoveContainerDto } from './model/MoveContainerDto';
import { RenameContainerDto } from './model/RenameContainerDto';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('containers')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('containers')
export class ContainersController {
  constructor(
    private readonly containersService: ContainersService,
    private readonly sessionService: SessionService,
  ) {}

  @Get('/:containerId')
  async getContainerById(@Req() req: Request) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    try {
      return this.containersService.getContainerById(user.id, req.params.containerId);
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }

  @Post('/empty')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async createContainer(@Body() createContainerDto: CreateContainerDto, @Req() req: Request) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.containersService.createContainer(user.id, createContainerDto);
  }

  @Put(':containerId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async renameContainer(
    @Param('containerId') containerId: string,
    @Body() renameContainerDto: RenameContainerDto,
    @Req() req: Request,
  ) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.containersService.renameContainer(user.id, containerId, renameContainerDto);
  }

  @Put(':containerId/move')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  public async moveContainer(
    @Param('containerId') containerId: string,
    @Body() moveContainerDto: MoveContainerDto,
    @Req() req: Request,
  ) {
    const { user } = await this.sessionService.getUserSession(req);
    if (!user) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    return this.containersService.moveContainer(user.id, containerId, moveContainerDto);
  }

  @Delete('/:containerId')
  @ApiHeaders([
    { name: 'access', required: true },
    { name: 'refresh', required: true },
  ])
  @ApiParam({
    name: 'containerId',
    required: true,
  })
  async deleteContainer(@Req() req: Request) {
    try {
      const userSession = await this.sessionService.getUserSession(req);
      if (!userSession.user) {
        throw new HttpException('Unauthorized', 401);
      }

      await this.containersService.deleteContainer(userSession.user.profile.id, req.params.containerId);

      return {
        message: 'Container deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
