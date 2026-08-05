import { Module } from '@nestjs/common';
import { AudioService } from './audio.service';
import { AudioController } from './audio.controller';
import { S3Module } from '../s3/s3.module';
import { StatsModule } from '../stats/stats.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [S3Module, StatsModule, AiModule],
  controllers: [AudioController],
  providers: [AudioService],
  exports: [AudioService],
})
export class AudioModule {}
