import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsUUID } from 'class-validator';
import { SUMMARY_FORMATS, SUMMARY_LENGTHS, SummaryFormat, SummaryLength } from './summary.types';

/**
 * openapi.yaml → GenerateSummaryRequest. `documentIds` absent = tout le notebook ;
 * un tableau VIDE est rejeté (ambigu : ni « sous-ensemble » ni « absent »).
 */
export class GenerateSummaryDto {
  @IsOptional()
  @IsArray()
  @ArrayNotEmpty()
  @IsUUID('all', { each: true })
  documentIds?: string[];

  @IsIn(SUMMARY_LENGTHS)
  length: SummaryLength;

  @IsIn(SUMMARY_FORMATS)
  format: SummaryFormat;
}
