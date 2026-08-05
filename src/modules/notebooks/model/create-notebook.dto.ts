import { IsIn, IsOptional, IsString, IsUUID, MaxLength, MinLength, ValidateIf } from 'class-validator';
import { VISIBILITIES, Visibility } from './notebook.types';

/** openapi.yaml → CreateNotebookRequest. Whitelist stricte (ValidationPipe global). */
export class CreateNotebookDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title: string;

  // uuid OU null (racine). Absent = racine.
  @IsOptional()
  @ValidateIf((o) => o.folderId !== null)
  @IsUUID()
  folderId?: string | null;

  @IsOptional()
  @IsString()
  prompt?: string;

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: Visibility;
}
