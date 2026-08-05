import { Module } from '@nestjs/common';

import { FoldersController } from './folders.controller';
import { FoldersService } from './folders.service';

import { ContainersModule } from "../containers/containers.module";

@Module({
  imports: [ContainersModule],
  controllers: [FoldersController],
  providers: [FoldersService],
  exports: [FoldersService],
})
export class FoldersModule {}
