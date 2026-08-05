import { Controller, Get, Res } from '@nestjs/common';
import { Response } from 'express';
import { AdminStatsService } from './admin-stats.service';
import { Public } from '../../core/auth/public.decorator';

// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('admin-stats')
export class AdminStatsController {
  public constructor(private readonly adminStatsService: AdminStatsService) {}

  @Get()
  public async getStats(@Res() res: Response) {
    return await this.adminStatsService.getStats(res);
  }
}
