import { ApiProperty } from '@nestjs/swagger';
import { DocumentTypeEnum } from 'src/modules/documents/model/DocumentTypeEnum';
import { LanguageEnum } from 'src/modules/documents/model/LanguageEnum';

export class FileUploadDto {
  @ApiProperty({ type: 'string', format: 'binary' })
  file: any;
  @ApiProperty({ type: 'string' })
  documentName: string;
  @ApiProperty({ type: 'string' })
  documentType: DocumentTypeEnum;
  language: LanguageEnum;
  @ApiProperty({ type: 'string' })
  containerId: string;
}
