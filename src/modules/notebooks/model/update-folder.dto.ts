import { IsString, MaxLength, MinLength } from 'class-validator';

/** openapi.yaml → body de PATCH /folders/:id (renommage). */
export class UpdateFolderDto {
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  label: string;
}
