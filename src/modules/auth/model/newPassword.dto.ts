import { Expose } from 'class-transformer';
import {
  IsEmail,
  IsNotEmpty,
  IsNumberString,
  IsString,
  MinLength,
} from 'class-validator';

export class newPassDto {
  @IsNotEmpty()
  @IsString()
  @IsEmail()
  @Expose()
  email: string;

  @IsNotEmpty()
  @IsNumberString()
  code: string;

  @IsNotEmpty()
  @IsString()
  @MinLength(6)
  @Expose()
  password: string;
}
