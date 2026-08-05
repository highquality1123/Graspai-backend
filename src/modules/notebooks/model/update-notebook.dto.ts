import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { VISIBILITIES, Visibility } from './notebook.types';

/**
 * openapi.yaml → UpdateNotebookRequest (`minProperties: 1`).
 * La contrainte « au moins un champ » est vérifiée dans le service (422 sinon) —
 * class-validator n'a pas d'équivalent natif de `minProperties`.
 */
export class UpdateNotebookDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsIn(VISIBILITIES)
  visibility?: Visibility;
}
