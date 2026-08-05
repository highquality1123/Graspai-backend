import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';
import { ConfigModule, ConfigService } from '@nestjs/config';
import * as bodyParser from 'body-parser';
import { Logger } from '@nestjs/common';
import * as session from 'express-session';
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from './core/http/global-prefix';
import { setupSwagger } from './core/swagger/swagger';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, {
    rawBody: true,
  });

  app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });

  // Swagger /api : ne documente que le backend V2 (voir V2_MODULES). Legacy servi mais non documenté.
  setupSwagger(app);

  await ConfigModule.envVariablesLoaded;

  const configService = app.get(ConfigService);
  const port = configService.get('app.port');
  app.use(bodyParser.urlencoded({ limit: '50mb', extended: true }));

  app.use(
    session({
      secret: process.env.EXPRESS_SESSION_SECRET,
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 3600000, // 1 hour session
      },
    }),
  );

  app.enableCors({
    origin: '*',
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  });

  await app.listen(process.env.PORT, () => {
    Logger.log(`🚀 Server up and running at port ${port}`);
  });
}
bootstrap();
