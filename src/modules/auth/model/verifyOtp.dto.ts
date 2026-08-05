import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsNumberString, IsString } from 'class-validator';

export class verifyOtpDto {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  @Expose()
  email: string;

  @IsNotEmpty()
  @IsNumberString()
  @Expose()
  code: string;
}
