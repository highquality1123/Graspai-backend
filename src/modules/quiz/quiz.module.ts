import { Module } from '@nestjs/common';
import { QuizController } from './quiz.controller';
import { QuizService } from './quiz.service';
import { DocumentsModule } from '../documents/documents.module';
import { StatsModule } from '../stats/stats.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [DocumentsModule, StatsModule, AiModule],
  controllers: [QuizController],
  providers: [QuizService],
  exports: [QuizService],
})
export class QuizModule {}
