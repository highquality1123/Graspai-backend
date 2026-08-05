import { Module } from '@nestjs/common';
import { GeneratedVideosController } from './generated-videos.controller';
import { GeneratedVideosService } from './generated-videos.service';
import { DocumentsModule } from '../documents/documents.module';
import { AiModule } from '../ai/ai.module';
import { StatsModule } from '../stats/stats.module';

@Module({
  imports: [DocumentsModule, AiModule, StatsModule],
  controllers: [GeneratedVideosController],
  providers: [GeneratedVideosService],
  exports: [GeneratedVideosService],
})
export class GeneratedVideosModule {}
