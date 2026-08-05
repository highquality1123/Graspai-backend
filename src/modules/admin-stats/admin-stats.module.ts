import { Module } from '@nestjs/common';
import { AdminStatsController } from './admin-stats.controller';
import { AdminStatsService } from './admin-stats.service';

@Module({
  imports: [],
  controllers: [AdminStatsController],
  providers: [AdminStatsService],
  exports: [AdminStatsService],
})
export class AdminStatsModule {}
