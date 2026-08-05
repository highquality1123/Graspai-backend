import { Module } from '@nestjs/common';
import { ConfigModule as NestConfigModule } from '@nestjs/config';
import appConfig from './app.config';
import { validationSchema, validationOptions } from './validation';

@Module({
  imports: [
    NestConfigModule.forRoot({
      ignoreEnvFile: false,
      validationSchema: validationSchema,
      validationOptions: validationOptions,
      load: [appConfig],
      envFilePath: '.env',
      isGlobal: true,
    }),
  ],
})
export class CustomConfigModule {}
