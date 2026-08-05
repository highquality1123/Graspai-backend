import { Module } from '@nestjs/common';

import { ContainersController } from './containers.controller';
import { ContainersService } from './containers.service';

import { DocumentsModule } from "../documents/documents.module";


@Module({
  imports: [DocumentsModule],
  controllers: [ContainersController],
  providers: [ContainersService],
  exports: [ContainersService],
})
export class ContainersModule {}
