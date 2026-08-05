import { Module } from '@nestjs/common';
import { StripeController } from './stripe.controller';
import { StripeService } from './stripe.service';
import { StatsModule } from '../stats/stats.module';
import { AmplitudeModule } from '../amplitude/amplitude.module';

@Module({
  imports: [StatsModule, AmplitudeModule],
  controllers: [StripeController],
  providers: [StripeService],
  exports: [StripeService],
})
export class StripeModule {}
