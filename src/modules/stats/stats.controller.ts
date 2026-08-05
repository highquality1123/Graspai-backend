import { Controller } from '@nestjs/common';
import { StatsService } from './stats.service';
import { Public } from '../../core/auth/public.decorator';

// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('stats')
export class StatsController {
  constructor(private readonly statsService: StatsService) {}
}
