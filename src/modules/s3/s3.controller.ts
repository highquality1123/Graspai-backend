import { Controller } from '@nestjs/common';
import { ApiTags } from '@nestjs/swagger';
import { S3Service } from './s3.service';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('s3')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('s3')
export class S3Controller {
  constructor(private readonly s3Service: S3Service) {}
}
