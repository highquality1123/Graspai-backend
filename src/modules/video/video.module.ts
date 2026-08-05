import { Module } from '@nestjs/common';
import { HttpModule } from '@nestjs/axios';
import { VideoService } from './video.service';
import { VideoController } from './video.controller';
import { StatsModule } from '../stats/stats.module';
import { DocumentsModule } from "../documents/documents.module";
import { ContainersModule } from "../containers/containers.module";
import { AiModule } from '../ai/ai.module';


@Module({
  imports: [HttpModule, StatsModule, DocumentsModule, ContainersModule, AiModule],
  controllers: [VideoController],
  providers: [VideoService],
  exports: [VideoService],
})
export class VideoModule {}
