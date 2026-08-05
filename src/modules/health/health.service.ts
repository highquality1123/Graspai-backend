import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class HealthService {
  async check(): Promise<{
    message: string;
  }> {
    return {
      message: 'OK',
    };
  }
  catch(error) {
    throw new HttpException(
      error.message,
      error.status || HttpStatus.BAD_REQUEST,
    );
  }
}
