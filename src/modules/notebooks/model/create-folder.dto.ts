import { IsString, MaxLength, MinLength } from 'class-validator';

/** openapi.yaml → body de POST /folders. */
export class CreateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;
}
