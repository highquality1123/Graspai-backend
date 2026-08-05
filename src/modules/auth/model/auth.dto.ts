import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsNumber, IsString } from 'class-validator';

export class AuthDTO {
  @IsNotEmpty()
  @IsEmail()
  @Expose()
  email: string;

  @IsNotEmpty()
  @IsString()
  password: string;
}

export class SessionDTO {
  @IsNotEmpty()
  @IsString()
  @Expose()
  access_token: string;

  @IsNotEmpty()
  @IsString()
  @Expose()
  refresh_token: string;

  @IsNotEmpty()
  @IsNumber()
  @Expose()
  expires_in: number;

  @IsNotEmpty()
  @IsNumber()
  @Expose()
  expires_at: number;

  @IsNotEmpty()
  @IsString()
  @Expose()
  token_type: string;
}
