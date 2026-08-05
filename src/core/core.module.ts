import { Global, Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_PIPE } from '@nestjs/core';
import { BearerAuthGuard } from './auth/bearer-auth.guard';
import { TokenVerifierService } from './auth/token-verifier.service';
import { AllExceptionsFilter } from './http/all-exceptions.filter';
import { createValidationPipe } from './http/validation-pipe';

@Global()
@Module({
  providers: [
    TokenVerifierService,
    {
      provide: APP_GUARD,
      useClass: BearerAuthGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_PIPE,
      useFactory: createValidationPipe,
    },
  ],
  exports: [TokenVerifierService],
})
export class CoreModule {}
