import { Module } from '@nestjs/common';
import { AiService } from './ai.service';

@Module({
  imports: [],
  controllers: [],
  providers: [AiService],
  exports: [AiService],
})
export class AiModule {}
