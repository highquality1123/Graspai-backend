import { ChapterDto } from "./ChapterDto";

export interface DocumentDto {
  id: string;
  user_id: string;
  created_at: string;
  updated_at: string;
  name: string;
  pages_count: number;
  length: number;
  tokens: number;
  url: string;
  type: string;
  language: string;
  pages?: any[];
  chapters?: ChapterDto[];
}
