import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { SupabaseService } from '../supabase/supabase.service';
import { generateQuizPrompt } from 'src/prompts/generateQuizPrompt';
import { CreateQuizRequestDto } from './model/CreateQuizRequestDto';
import { DocumentsService } from '../documents/documents.service';
import { ChatPromptTemplate } from 'langchain/prompts';
import { RunnableSequence } from 'langchain/schema/runnable';
import { PassQuizRequestDto } from './model/PassQuizRequestDto';
import { StatsService } from '../stats/stats.service';
import { AiService } from '../ai/ai.service';
import { CreateGeneralQuizRequestDto } from './model/CreateGeneralQuizRequestDto';
import { QuizQuestionType } from './model/QuizQuestionType';
import { QuizDifficultyLevel } from './model/QuizDifficultyLevel';
import z from 'zod';
import { getTrueFalseLabels } from './quizLanguage';

const RETRIEVER_PAGES_COUNT = 25;
const QUIZ_QUESTIONS_COUNT_DEFAULT = 20;
const MAX_GENERATION_RETRIES = 3;

@Injectable()
export class QuizService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly documentsService: DocumentsService,
    private readonly statsService: StatsService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async generateGeneralQuiz(userId: string, quizRequest: CreateGeneralQuizRequestDto) {
    console.log('General quiz generation requested', userId, quizRequest);

    if (!quizRequest.documentId) {
      throw new BadRequestException('Missing required fields');
    }

    if (!quizRequest.questionsCount) {
      quizRequest.questionsCount = QUIZ_QUESTIONS_COUNT_DEFAULT;
    }

    await this.documentsService.verifyUserAccessAndGetDocument(userId, quizRequest.documentId);
    await this.validateUsageLimits(userId);

    const sanitizedQuery = 'Generate quiz from the given context';

    const documentsResponse = await this.supabase
      .from('documents')
      .select('*')
      .eq('id', quizRequest.documentId);

    const language = documentsResponse.data[0]?.language || 'en';

    const retrievedDocuments = await this.aiService.getRandomDocumentPieces(
      quizRequest.documentId,
      RETRIEVER_PAGES_COUNT * 4,
    );

    const outputSchema = this.getQuizOutputFormat(language, QuizQuestionType.MIXED, QuizDifficultyLevel.MIXED);

    const allGeneratedQuestions: any[] = [];
    let previousQuestions: string[] = [];

    for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
      const remainingCount = quizRequest.questionsCount - allGeneratedQuestions.length;

      // Exit immediately if we have enough - SPEED OPTIMIZATION
      if (remainingCount <= 0) break;

      console.log(`Quiz generation attempt ${attempt + 1}: Need ${remainingCount} more questions`);

      try {
        const promptTemplate = await generateQuizPrompt({
          query: sanitizedQuery,
          questionsCount: remainingCount,
          questionsType: QuizQuestionType.MIXED,
          difficultyLevel: QuizDifficultyLevel.MIXED,
          language,
          previousQuestions
        });

        const chain = this.buildChain(retrievedDocuments, promptTemplate, outputSchema);
        const response = await chain.invoke({ question: sanitizedQuery });
        const generatedQuestions = response?.items || [];

        if (generatedQuestions.length > 0) {
          // Only take exactly what we need - prevents redundant items
          const questionsToAdd = generatedQuestions.slice(0, remainingCount);
          allGeneratedQuestions.push(...questionsToAdd);
          previousQuestions = this.extractQuestionTexts(allGeneratedQuestions);
          console.log(`Generated ${generatedQuestions.length} questions, added ${questionsToAdd.length}. Total: ${allGeneratedQuestions.length}/${quizRequest.questionsCount}`);

          // Exit immediately if we now have enough - SPEED OPTIMIZATION
          if (allGeneratedQuestions.length >= quizRequest.questionsCount) break;
        }

        // Add delay between batches to avoid rate limiting (500ms)
        if (attempt < MAX_GENERATION_RETRIES - 1 && allGeneratedQuestions.length < quizRequest.questionsCount) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Quiz generation attempt ${attempt + 1} failed:`, error.message);

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < MAX_GENERATION_RETRIES - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else {
          // On final attempt, throw if we have no questions at all
          if (allGeneratedQuestions.length === 0) {
            throw error;
          }
        }
      }
    }

    if (allGeneratedQuestions.length === 0) {
      throw new BadRequestException('Failed to generate any quiz questions');
    }

    // Final safeguard: ensure exactly the requested count
    const finalQuestions = allGeneratedQuestions.slice(0, quizRequest.questionsCount);

    console.log(`Quiz generation completed: ${finalQuestions.length}/${quizRequest.questionsCount} questions`);

    const newQuiz = {
      query: 'General quiz',
      document_id: quizRequest.documentId,
    };
    const { data: quiz } = await this.supabase.from('quizzes').insert(newQuiz).select('*').single();

    const newQuestions = finalQuestions.map((questionInfo) => {
      return {
        quiz_id: quiz.id,
        question: questionInfo.question,
        question_type: questionInfo.questionType,
        options: questionInfo.options,
        page_number: questionInfo.pageNumber,
        explanation: questionInfo.explanation,
        citation: questionInfo.citation,
        difficulty_level: questionInfo.difficultyLevel,
        correct_answer: questionInfo.correctAnswer,
      };
    });
    const { data: quizQuestions } = await this.supabase.from('quiz_questions').insert(newQuestions).select('*');
    quiz.questions = quizQuestions;

    return quiz;
  }

  public async generateQuiz(userId: string, quizRequest: CreateQuizRequestDto) {
    console.log('Quiz generation requested', userId, quizRequest);

    if (!quizRequest.documentId || !quizRequest.query) {
      throw new BadRequestException('Missing required fields');
    }

    // Set defaults for optional parameters
    if (!quizRequest.questionsCount) {
      quizRequest.questionsCount = QUIZ_QUESTIONS_COUNT_DEFAULT;
    }
    if (!quizRequest.questionsType) {
      quizRequest.questionsType = QuizQuestionType.MIXED;
    }
    if (!quizRequest.difficultyLevel) {
      quizRequest.difficultyLevel = QuizDifficultyLevel.MIXED;
    }

    await this.documentsService.verifyUserAccessAndGetDocument(userId, quizRequest.documentId);
    await this.validateUsageLimits(userId);

    const sanitizedQuery = quizRequest.query.trim().replaceAll('\n', ' ') as string;

    const documentsResponse = await this.supabase
      .from('documents')
      .select('*')
      .eq('id', quizRequest.documentId);

    const language = documentsResponse.data[0]?.language || 'en';

    const retrievedDocuments = await this.aiService.getRelevantDocumentPieces(
      quizRequest.documentId,
      sanitizedQuery,
      RETRIEVER_PAGES_COUNT,
    );

    const outputSchema = this.getQuizOutputFormat(language, quizRequest.questionsType, quizRequest.difficultyLevel);

    const allGeneratedQuestions: any[] = [];
    let previousQuestions: string[] = [];

    for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
      const remainingCount = quizRequest.questionsCount - allGeneratedQuestions.length;

      // Exit immediately if we have enough - SPEED OPTIMIZATION
      if (remainingCount <= 0) break;

      console.log(`Quiz generation attempt ${attempt + 1}: Need ${remainingCount} more questions`);

      try {
        let promptTemplate = await generateQuizPrompt({
          query: quizRequest.query,
          questionsCount: remainingCount,
          questionsType: quizRequest.questionsType,
          difficultyLevel: quizRequest.difficultyLevel,
          language,
          previousQuestions
        });

        const chain = this.buildChain(retrievedDocuments, promptTemplate, outputSchema);

        const response = await chain.invoke({
          question: sanitizedQuery,
        });

        const generatedQuestions = response?.items || [];

        if (generatedQuestions.length > 0) {
          // Only take exactly what we need - prevents redundant items
          const questionsToAdd = generatedQuestions.slice(0, remainingCount);
          allGeneratedQuestions.push(...questionsToAdd);
          previousQuestions = this.extractQuestionTexts(allGeneratedQuestions);
          console.log(`Generated ${generatedQuestions.length} questions, added ${questionsToAdd.length}. Total: ${allGeneratedQuestions.length}/${quizRequest.questionsCount}`);

          // Exit immediately if we now have enough - SPEED OPTIMIZATION
          if (allGeneratedQuestions.length >= quizRequest.questionsCount) break;
        }

        // Add delay between batches to avoid rate limiting (500ms)
        if (attempt < MAX_GENERATION_RETRIES - 1 && allGeneratedQuestions.length < quizRequest.questionsCount) {
          await new Promise(resolve => setTimeout(resolve, 500));
        }
      } catch (error) {
        console.error(`Quiz generation attempt ${attempt + 1} failed:`, error.message);

        // Exponential backoff: 1s, 2s, 4s
        if (attempt < MAX_GENERATION_RETRIES - 1) {
          const backoffMs = Math.pow(2, attempt) * 1000;
          console.log(`Retrying in ${backoffMs}ms...`);
          await new Promise(resolve => setTimeout(resolve, backoffMs));
        } else {
          // On final attempt, throw if we have no questions at all
          if (allGeneratedQuestions.length === 0) {
            throw error;
          }
        }
      }
    }

    if (allGeneratedQuestions.length === 0) {
      throw new BadRequestException('Failed to generate any quiz questions');
    }

    // Final safeguard: ensure exactly the requested count
    const finalQuestions = allGeneratedQuestions.slice(0, quizRequest.questionsCount);

    console.log(`Quiz generation completed: ${finalQuestions.length}/${quizRequest.questionsCount} questions`);

    const newQuiz = {
      query: quizRequest.query,
      document_id: quizRequest.documentId,
    };
    const { data: quiz } = await this.supabase.from('quizzes').insert(newQuiz).select('*').single();

    const newQuestions = finalQuestions.map((questionInfo) => {
      return {
        quiz_id: quiz.id,
        question: questionInfo.question,
        question_type: questionInfo.questionType,
        options: questionInfo.options,
        page_number: questionInfo.pageNumber,
        explanation: questionInfo.explanation,
        citation: questionInfo.citation,
        difficulty_level: questionInfo.difficultyLevel,
        correct_answer: questionInfo.correctAnswer,
      };
    });
    const { data: quizQuestions } = await this.supabase.from('quiz_questions').insert(newQuestions).select('*');
    quiz.questions = quizQuestions;

    return quiz;
  }

  private buildChain(retrievedDocuments: any, promptTemplate: string, outputSchema: any) {
    const context = this.combineDocuments(retrievedDocuments);

    const answerPrompt = ChatPromptTemplate.fromMessages([
      ['system', promptTemplate as string],
      ['human', '{question}'],
    ]);

    // Use lower temperature (0.3) for more consistent structured output
    const model = this.aiService.getModel(null, 0.3);

    const answerChain: any = RunnableSequence.from([
      {
        context: () => context,
        question: (input) => input.question,
      },
      answerPrompt,
      model.withStructuredOutput(outputSchema),
    ] as any);

    return answerChain;
  }

  private getQuizOutputFormat(language: string, questionType: string, difficultyLevel: string) {
    let difficultyLevelSchema: any = z
      .literal(difficultyLevel)
      .describe('This is the difficulty level of the question');

    if (difficultyLevel === 'mixed') {
      difficultyLevelSchema = z
        .enum(['easy', 'medium', 'hard'])
        .describe('This is the difficulty level of the question');
    }

    const trueFalseOptions = getTrueFalseLabels(language);

    const multipleChoiceSchema = z.object({
      question: z.string().describe('The quiz question text'),
      correctAnswer: z.string().describe('The correct answer'),
      pageNumber: z.number().describe("The page number in the document where the question's answer can be found"),
      questionType: z.literal('multiple_choice').describe('The question type'),
      options: z.array(z.string().describe('Options including the correct answer and plausible distractors')),
      difficultyLevel: difficultyLevelSchema,
      explanation: z
        .string()
        .describe('A brief explanation of why the correct answer is right, and why the incorrect options are wrong'),
      citation: z.string().describe('An exact text piece from the document containing the right answer'),
    });

    const trueFalseSchema = z.object({
      question: z.string().describe('The quiz question text'),
      correctAnswer: z.string().describe('The correct answer'),
      pageNumber: z.number().describe("The page number in the document where the question's answer can be found"),
      questionType: z.literal('true_false').describe('The question type'),
      options: z
        .array(z.enum(trueFalseOptions as [string, string]))
        .length(2)
        .describe('true_false options'),
      difficultyLevel: difficultyLevelSchema,
      explanation: z
        .string()
        .describe('A brief explanation of why the correct answer is right, and why the incorrect options are wrong'),
      citation: z.string().describe('An exact text piece from the document containing the right answer'),
    });

    const itemSchema =
      questionType === 'mixed'
        ? z.discriminatedUnion('questionType', [multipleChoiceSchema, trueFalseSchema])
        : questionType === 'true_false'
          ? trueFalseSchema
          : multipleChoiceSchema;

    return z.object({
      items: z.array(itemSchema),
    });
  }

  private combineDocuments(docs, separator = '\n\n') {
    const serializedDocs = docs.map((page) => {
      const pageContent =
        '$$Start Of Page No ' +
        page.metadata.page_number +
        '$$' +
        page.content +
        '$$End Of Page No ' +
        page.metadata.page_number +
        '$$';
      return pageContent;
    });
    return serializedDocs.join(separator);
  }

  private extractQuestionTexts(questions: any[]): string[] {
    return questions.map((q) => q.question);
  }

  public async getQuizzesByDocumentId(userId: string, documentId: string) {
    if (!documentId) {
      throw new BadRequestException('Document id is required');
    }
    await this.documentsService.verifyUserAccessAndGetDocument(userId, documentId);

    const { data: quizzes } = await this.supabase
      .from('quizzes')
      .select('*, questions: quiz_questions(*)')
      .eq('document_id', documentId);

    return quizzes;
  }

  public async deleteQuiz(userId: string, quizId: string) {
    await this.validateUserAccessAndGetQuiz(userId, quizId);

    const { error, status } = await this.supabase.from('quizzes').delete().eq('id', quizId);
    if (error) {
      console.log('Quiz delete', error, status);
      throw new HttpException(error.message, status);
    }

    return { message: 'Quiz deleted successfully' };
  }

  private async validateUserAccessAndGetQuiz(userId: string, quizId: string) {
    const { data: quiz } = await this.supabase
      .from('quizzes')
      .select('*, document: documents(user_id)')
      .eq('id', quizId)
      .single();
    if (!quiz) {
      throw new HttpException('Quiz not found', HttpStatus.NOT_FOUND);
    }
    if (quiz.document.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
    return quiz;
  }

  public async passQuiz(userId: string, quizId: string, passQuizRequest: PassQuizRequestDto) {
    const quiz = await this.validateUserAccessAndGetQuiz(userId, quizId);
    if (!passQuizRequest || !passQuizRequest.answers || passQuizRequest.answers.length === 0) {
      throw new HttpException('Answers are required', HttpStatus.BAD_REQUEST);
    }
    let passedQuestionsCount = 0;
    let passTimeSeconds = 0;
    const answers = passQuizRequest.answers.map((answer) => {
      if (
        !answer.answer ||
        !answer.correct_answer ||
        !answer.difficulty_level ||
        !answer.explanation ||
        !answer.question ||
        !answer.question_type
      ) {
        throw new HttpException('Missing required fields', HttpStatus.BAD_REQUEST);
      }

      answer.is_correct = answer?.answer?.toLowerCase() == answer?.correct_answer?.toLowerCase();
      if (answer.is_correct) {
        passedQuestionsCount++;
      }
      passTimeSeconds += answer.time_seconds;

      return answer;
    });

    const quizAnswer = {
      quiz_id: quiz.id,
      answers: answers,
      passed_questions_count: passedQuestionsCount,
      total_questions_count: answers.length,
      time_seconds: passTimeSeconds,
      user_id: userId,
    };
    const {
      error,
      status,
      data: quizAnswerRow,
    } = await this.supabase.from('quiz_answers').insert(quizAnswer).select('*');
    if (error) {
      throw new HttpException(error.message, status);
    }

    return quizAnswerRow;
  }

  public async getQuizHistory(userId: string, quizId: string) {
    await this.validateUserAccessAndGetQuiz(userId, quizId);

    const { data: quizAnswers } = await this.supabase
      .from('quiz_answers')
      .select('*')
      .eq('quiz_id', quizId)
      .order('created_at', { ascending: false });

    return quizAnswers;
  }

  private async validateUsageLimits(userId: string, aiPromptsCount: number = 1) {
    await this.statsService.registerAiPromptsUsage(userId, aiPromptsCount);
  }
}
