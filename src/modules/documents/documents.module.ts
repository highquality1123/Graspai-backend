import { Module } from '@nestjs/common';
import { DocumentsController } from './documents.controller';
import { DocumentsService } from './documents.service';
import { S3Module } from '../s3/s3.module';
import { StatsModule } from '../stats/stats.module';
import { AiModule } from '../ai/ai.module';
import { PdfModule } from '../pdf/pdf.module';
import { ChatModule } from '../chat/chat.module';
import { AudioModule } from '../audio/audio.module';

@Module({
  imports: [S3Module, StatsModule, AiModule, PdfModule, ChatModule, AudioModule],
  controllers: [DocumentsController],
  providers: [DocumentsService],
  exports: [DocumentsService],
})
export class DocumentsModule {}
