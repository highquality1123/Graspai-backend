// NestJS Imports
import { Controller, HttpException, HttpStatus, Get } from '@nestjs/common';

import { HealthService } from './health.service';
import { Public } from '../../core/auth/public.decorator';

// Public par contrat : health-check hors garde Bearer (openapi.yaml, exclusions /v1).
@Public()
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Get('check')
  async check() {
    try {
      const result = await this.healthService.check();
      return result;
    } catch (error) {
      throw new HttpException(error.message, error.status || HttpStatus.BAD_REQUEST);
    }
  }
}
