import { Controller, Get, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { GLOBAL_PREFIX, GLOBAL_PREFIX_EXCLUDES } from './global-prefix';

@Controller()
class ThingController {
  @Get('thing')
  thing(): string {
    return 'ok';
  }
}

@Controller('health')
class HealthTestController {
  @Get('check')
  check(): string {
    return 'up';
  }
}

@Controller('stripe')
class StripeTestController {
  @Post('webhook')
  webhook(): string {
    return 'hook';
  }
}

describe('Global prefix + exclusions', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      controllers: [ThingController, HealthTestController, StripeTestController],
    }).compile();

    app = moduleRef.createNestApplication();
    app.setGlobalPrefix(GLOBAL_PREFIX, { exclude: GLOBAL_PREFIX_EXCLUDES });
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('serves a normal route under /v1', () => {
    return request(app.getHttpServer()).get('/v1/thing').expect(200).expect('ok');
  });

  it('does NOT serve a normal route at the root path', () => {
    return request(app.getHttpServer()).get('/thing').expect(404);
  });

  it('keeps GET /health/check at the root (excluded)', () => {
    return request(app.getHttpServer()).get('/health/check').expect(200).expect('up');
  });

  it('does NOT expose the excluded health route under /v1', () => {
    return request(app.getHttpServer()).get('/v1/health/check').expect(404);
  });

  it('keeps POST /stripe/webhook at the root (excluded)', () => {
    return request(app.getHttpServer()).post('/stripe/webhook').expect(201).expect('hook');
  });

  it('does NOT expose the excluded webhook under /v1', () => {
    return request(app.getHttpServer()).post('/v1/stripe/webhook').expect(404);
  });
});
