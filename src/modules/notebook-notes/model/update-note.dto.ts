import { IsOptional, IsString, MaxLength } from 'class-validator';

/**
 * openapi.yaml → body de PATCH /notebooks/:notebookId/notes/:noteId (`minProperties: 1`).
 * La contrainte « au moins un champ » est vérifiée dans le service (422 sinon) —
 * class-validator n'a pas d'équivalent natif de `minProperties`.
 * `title` : `maxLength 300` seul — le contrat n'impose PAS de `minLength` en update (≠ create).
 */
export class UpdateNoteDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  title?: string;

  @IsOptional()
  @IsString()
  body?: string;
}
