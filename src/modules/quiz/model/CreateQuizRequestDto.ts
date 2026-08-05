import { QuizDifficultyLevel } from './QuizDifficultyLevel';
import { QuizQuestionType } from './QuizQuestionType';

export interface CreateQuizRequestDto {
  query: string;
  questionsCount?: number;
  questionsType?: QuizQuestionType; // Defaults to MIXED
  difficultyLevel?: QuizDifficultyLevel; // Defaults to MIXED
  documentId: string;
}
