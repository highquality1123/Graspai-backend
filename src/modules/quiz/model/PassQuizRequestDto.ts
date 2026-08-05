import { QuizDifficultyLevel } from './QuizDifficultyLevel';
import { QuizQuestionType } from './QuizQuestionType';

export interface QuizAnswerDto {
  question: string;
  explanation: string;
  page_number: number;
  question_type: QuizQuestionType;
  correct_answer: string;
  difficulty_level: QuizDifficultyLevel;
  answer: string;
  time_seconds: number;
  is_correct: boolean;
}

export interface PassQuizRequestDto {
  answers: QuizAnswerDto[];
}
