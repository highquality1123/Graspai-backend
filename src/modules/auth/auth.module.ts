import { Module } from '@nestjs/common';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { ContainersModule } from "../containers/containers.module";
import { CustomerioModule } from "../customerio/customerio.module";
import { AmplitudeModule } from "../amplitude/amplitude.module";

@Module({
  imports: [ContainersModule, CustomerioModule, AmplitudeModule],
  controllers: [AuthController],
  providers: [AuthService],
  exports: [AuthService],
})
export class AuthModule {}
