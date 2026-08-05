import { IsDateString, IsInt, IsOptional, IsUUID, Max, Min, ValidateIf } from 'class-validator';

/** openapi.yaml → body de POST /study-sessions. Whitelist stricte (ValidationPipe global). */
export class CreateStudySessionDto {
  // uuid OU null (session hors notebook). Absent = null. Si fourni, propriété vérifiée en service.
  @IsOptional()
  @ValidateIf((o) => o.notebookId !== null)
  @IsUUID()
  notebookId?: string | null;

  // 1s .. 86400s (= 24h). Le @Max double le CHECK DB (migration 010) -> 422 propre au lieu d'un 500.
  // (le contrat n'a que `minimum: 1` — borne haute ajoutée à la demande d'Othmane.)
  @IsInt()
  @Min(1)
  @Max(86400)
  durationSeconds: number;

  @IsDateString()
  completedAt: string;
}
