import { IsUUID, ValidateIf } from 'class-validator';

/**
 * openapi.yaml → body de PATCH /notebooks/:id/move. `folderId` est REQUIS mais nullable
 * (`null` = racine). Présent + null => ok ; présent + uuid => ok ; absent => rejeté.
 */
export class MoveNotebookDto {
  @ValidateIf((o) => o.folderId !== null)
  @IsUUID()
  folderId: string | null;
}
