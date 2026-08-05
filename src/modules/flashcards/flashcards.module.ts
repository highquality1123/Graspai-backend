import { Module } from '@nestjs/common';
import { FlashcardsService } from './flashcards.service';
import { FlashcardsController } from './flashcards.controller';
import { DocumentsModule } from '../documents/documents.module';
import { StatsModule } from '../stats/stats.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DocumentsModule, StatsModule, AiModule],
  controllers: [FlashcardsController],
  providers: [FlashcardsService],
  exports: [FlashcardsService],
})
export class FlashcardsModule {}
