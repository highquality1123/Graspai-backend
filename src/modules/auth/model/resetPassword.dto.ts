import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsString } from 'class-validator';

export class resetPasswordDto {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  @Expose()
  email: string;
}
