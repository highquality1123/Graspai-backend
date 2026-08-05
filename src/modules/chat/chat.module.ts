import { Module } from '@nestjs/common';
import { StreamGateway } from 'src/stream.gateway';
import { ChatController } from './chat.controller';
import { ChatService } from './chat.service';
import { StatsModule } from '../stats/stats.module';
import { AiModule } from '../ai/ai.module';

@Module({
  imports: [StatsModule, AiModule],
  controllers: [ChatController],
  providers: [ChatService, StreamGateway],
  exports: [ChatService],
})
export class ChatModule {}
