import { IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';

/** openapi.yaml → CreateNoteRequest. Whitelist stricte (ValidationPipe global). */
export class CreateNoteDto {
  @IsString()
  @MinLength(1)
  @MaxLength(300)
  title: string;

  @IsString()
  body: string;

  // openapi : sourceDocumentId optionnel (uuid). Persisté en `document_id` -> corrige le bug legacy
  // (l'insert legacy ne persistait jamais document_id, notes.service.ts:28).
  @IsOptional()
  @IsUUID()
  sourceDocumentId?: string;
}
