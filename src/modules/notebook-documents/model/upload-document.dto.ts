import { IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { DOCUMENT_KINDS, DOCUMENT_LANGUAGES, DocumentKind, DocumentLanguage } from './document.types';

/**
 * openapi.yaml → requestBody multipart de uploadDocument. Le champ `file` est porté par
 * multer (FileInterceptor), pas par le DTO ; sa présence et son contenu sont validés en service.
 */
export class UploadDocumentDto {
  @IsIn(DOCUMENT_KINDS)
  kind: DocumentKind;

  // Nom d'affichage ; défaut = nom du fichier (appliqué en service).
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  label?: string;

  @IsOptional()
  @IsIn(DOCUMENT_LANGUAGES)
  language?: DocumentLanguage;
}
