import { Module } from '@nestjs/common';
import { CustomerioService } from "./customerio.service";

@Module({
  imports: [],
  controllers: [],
  providers: [CustomerioService],
  exports: [CustomerioService],
})
export class CustomerioModule {}
