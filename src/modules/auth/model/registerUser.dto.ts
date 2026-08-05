// Class Validator imports
import { Expose } from 'class-transformer';
import { IsEmail, IsNotEmpty, IsNumber, IsString, Matches } from 'class-validator';

export class RegisterUserDto {
  // =================================== User Basic Details ===================================

  @IsNotEmpty()
  @IsString()
  @Expose()
  fullName: string;

  @IsNotEmpty()
  @IsEmail()
  @Expose()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(?!\s*$).+/, { message: 'White spaces not allowed' })
  @Expose()
  password: string;
}

export class VerifyConfirmationOtpDTO {
  @IsNotEmpty()
  @IsEmail()
  @Expose()
  email: string;

  @IsNotEmpty()
  @IsString()
  @Matches(/^(?!\s*$).+/, { message: 'White spaces not allowed' })
  @Expose()
  password: string;

  @IsNotEmpty()
  @IsNumber()
  @Expose()
  otp: number;
}
