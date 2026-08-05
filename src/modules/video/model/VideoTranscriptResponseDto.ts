import { VideoCreateFromLinkDtoContent } from './VideoCreateFromLinkDtoContent';

export interface VideoTranscriptResponseDto {
  error?: string;
  message?: string;
  lang?: string;
  availableLangs?: string[];
  content?: VideoCreateFromLinkDtoContent[];
}
