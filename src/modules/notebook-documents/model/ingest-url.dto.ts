import { IsUrl } from 'class-validator';

/** openapi.yaml → requestBody de ingestUrl (YouTube en v1 ; page web au goal 5). */
export class IngestUrlDto {
  @IsUrl()
  url: string;
}
