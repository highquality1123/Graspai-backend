import { IsString, MaxLength, MinLength } from 'class-validator';

/** openapi.yaml → requestBody de updateDocument (renommage). */
export class UpdateDocumentDto {
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label: string;
}
