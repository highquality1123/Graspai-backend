import { Controller, Get, INestApplication, Module } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import { Test } from '@nestjs/testing';
import { V2_MODULES } from './swagger';

// Représentatif d'un controller legacy (ex. ContainersController) : servi mais à exclure de la doc.
@Controller('containers')
class FakeLegacyContainersController {
  @Get()
  list(): unknown[] {
    return [];
  }
}

// Représentatif d'un controller V2 (health fait partie du contrat).
@Controller('health')
class FakeHealthController {
  @Get('check')
  check(): string {
    return 'up';
  }
}

@Module({ controllers: [FakeLegacyContainersController] })
class FakeLegacyModule {}

@Module({ controllers: [FakeHealthController] })
class FakeV2Module {}

describe('Swagger V2 whitelist (include mechanism)', () => {
  let app: INestApplication;
  let paths: string[];

  beforeAll(async () => {
    const moduleRef = await Test.createTestingModule({
      imports: [FakeLegacyModule, FakeV2Module],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();

    const config = new DocumentBuilder().setTitle('test').setVersion('1.0').build();
    // Même appel que setupSwagger : seul le module V2 est inclus.
    const document = SwaggerModule.createDocument(app, config, { include: [FakeV2Module] });
    paths = Object.keys(document.paths);
  });

  afterAll(async () => {
    await app.close();
  });

  it('documents the V2 controller', () => {
    expect(paths).toContain('/health/check');
  });

  it('does NOT document the legacy controller', () => {
    expect(paths).not.toContain('/containers');
  });

  it('exposes exactly the whitelisted surface (no leak)', () => {
    expect(paths).toEqual(['/health/check']);
  });

  it('real V2_MODULES contains only V2 modules (no legacy)', () => {
    expect(V2_MODULES.map((m) => m.name)).toEqual([
      'HealthModule',
      'JobsModule',
      'NotebooksModule',
      'NotebookDocumentsModule',
      'NotebookSummariesModule',
      'NotebookNotesModule',
      'SearchModule',
      'StudySessionsModule',
      'UsersModule',
    ]);
  });
});
