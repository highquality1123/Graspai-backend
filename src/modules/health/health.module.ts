// Nest JS Imports
import { Module } from '@nestjs/common';

// Services Imports
import { HealthService } from './health.service';

// Controllers Imports
import { HealthController } from './health.controller';

@Module({
  imports: [],
  controllers: [HealthController],
  providers: [HealthService],
  exports: [],
})
export class HealthModule {}
