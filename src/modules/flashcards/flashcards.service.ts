import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';
import { SupabaseClient } from '@supabase/supabase-js';
import { generateFlashCardsPrompt } from 'src/prompts/generateFlashCardsPrompt';
import { GenerateFlashcardsSetRequestDto } from './model/GenerateFlashcardsSetRequestDto';
import { DocumentsService } from '../documents/documents.service';
import { ChatPromptTemplate } from 'langchain/prompts';
import { RunnableSequence } from 'langchain/schema/runnable';
import { StatsService } from '../stats/stats.service';
import { AiService } from '../ai/ai.service';
import { FlashcardItem, SaveFlashcardsSetRequestDto } from './model/SaveFlashcardsSetRequestDto';
import { SupabaseService } from '../supabase/supabase.service';
import { z } from 'zod';

const RETRIEVER_PAGES_COUNT = 25;
const FLASHCARDS_COUNT_DEFAULT = 10;
const MAX_GENERATION_RETRIES = 3;

@Injectable()
export class FlashcardsService {
  private supabase: SupabaseClient;

  public constructor(
    private readonly documentsService: DocumentsService,
    private readonly statsService: StatsService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async generateFlashcardsSet(userId: string, request: GenerateFlashcardsSetRequestDto) {
    console.log('Flashcards generation requested', userId, request);

    if (!request.documentId || !request.topic) {
      throw new BadRequestException('Missing required fields');
    }

    if (!request.cardsCount) {
      request.cardsCount = FLASHCARDS_COUNT_DEFAULT;
    }

    await this.documentsService.verifyUserAccessAndGetDocument(userId, request.documentId);
    await this.validateUsageLimits(userId);

    const sanitizedQuery = request.topic.trim().replaceAll('\n', ' ') as string;

    const retrievedDocuments = await this.aiService.getRelevantDocumentPieces(
      request.documentId,
      sanitizedQuery,
      RETRIEVER_PAGES_COUNT,
    );

    const outputSchema = this.getFlashcardsOutputFormat();

    const allGeneratedFlashcards: any[] = [];
    let previousFlashcards: string[] = [];

    for (let attempt = 0; attempt < MAX_GENERATION_RETRIES; attempt++) {
      const remainingCount = request.cardsCount - allGeneratedFlashcards.length;

      // Exit immediately if we have enough - SPEED OPTIMIZATION
      if (remainingCount <= 0) break;

      console.log(`Flashcards generation attempt ${attempt + 1}: Need ${remainingCount} more flashcards`);

      const promptTemplate = generateFlashCardsPrompt({
        cardsCount: remainingCount,
        previousFlashcards,
      });

      const chain = this.buildChain(retrievedDocuments, promptTemplate, outputSchema);

      const response = await chain.invoke({
        question: `Generate flashcards about ${sanitizedQuery}`,
      });

      const generatedFlashcards = response?.items || [];

      if (generatedFlashcards.length > 0) {
        // Only take exactly what we need - prevents redundant items
        const flashcardsToAdd = generatedFlashcards.slice(0, remainingCount);
        allGeneratedFlashcards.push(...flashcardsToAdd);
        previousFlashcards = this.extractFlashcardQuestions(allGeneratedFlashcards);
        console.log(`Generated ${generatedFlashcards.length} flashcards, added ${flashcardsToAdd.length}. Total: ${allGeneratedFlashcards.length}/${request.cardsCount}`);

        // Exit immediately if we now have enough - SPEED OPTIMIZATION
        if (allGeneratedFlashcards.length >= request.cardsCount) break;
      }
    }

    if (allGeneratedFlashcards.length === 0) {
      throw new BadRequestException('Failed to generate any flashcards');
    }

    // Final safeguard: ensure exactly the requested count
    const finalFlashcards = allGeneratedFlashcards.slice(0, request.cardsCount);

    console.log(`Flashcards generation completed: ${finalFlashcards.length}/${request.cardsCount} flashcards`);

    const newFlashcardsSet = {
      topic: request.topic,
      document_id: request.documentId,
    };
    const { data: flashcardsSet } = await this.supabase
      .from('flashcards_sets')
      .insert(newFlashcardsSet)
      .select('*')
      .single();

    const newFlashcards = finalFlashcards.map((flashcardInfo) => {
      return {
        flashcards_set_id: flashcardsSet.id,
        question: flashcardInfo.question,
        answer: flashcardInfo.answer,
        page_number: flashcardInfo.pageNumber,
      };
    });
    const { data: flashcards } = await this.supabase.from('flashcards').insert(newFlashcards).select('*');
    flashcardsSet.questions = flashcards;

    return flashcardsSet;
  }

  private buildChain(retrievedDocuments: any, promptTemplate: string, outputSchema: any) {
    const context = this.combineDocuments(retrievedDocuments);

    const answerPrompt = ChatPromptTemplate.fromMessages([
      ['system', promptTemplate as string],
      ['human', '{question}'],
    ]);

    const model = this.aiService.getModel(null, 0.8);

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

  private getFlashcardsOutputFormat() {
    const flashcardSchema = z.object({
      question: z.string().describe('The flashcard question text'),
      answer: z.string().describe('The complete answer to the question'),
      pageNumber: z.number().describe('The page number in the document where the answer can be found'),
    });

    return z.object({
      items: z.array(flashcardSchema),
    });
  }

  private extractFlashcardQuestions(flashcards: any[]): string[] {
    return flashcards.map((f) => f.question);
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

  public async saveFlashcardsSet(userId: string, request: SaveFlashcardsSetRequestDto) {
    console.log('Save manually created flashcards', userId, request);

    if (!request.documentId || !request.topic || !request.cards || !request.cards.length) {
      throw new BadRequestException('Missing required fields');
    }
    await this.documentsService.verifyUserAccessAndGetDocument(userId, request.documentId);

    const newFlashcardsSet = {
      topic: request.topic,
      document_id: request.documentId,
    };
    const { data: flashcardsSet } = await this.supabase
      .from('flashcards_sets')
      .insert(newFlashcardsSet)
      .select('*')
      .single();

    const newFlashcards = request.cards.map((card: FlashcardItem) => {
      if (!card.question || !card.answer) {
        throw new BadRequestException('Missing required fields');
      }
      return {
        flashcards_set_id: flashcardsSet.id,
        question: card.question,
        answer: card.answer,
        page_number: -1,
      };
    });
    const { data: flashcards } = await this.supabase.from('flashcards').insert(newFlashcards).select('*');
    flashcardsSet.questions = flashcards;

    return flashcardsSet;
  }

  public async getFlashcardsSetsByDocumentId(userId: string, documentId: string) {
    if (!documentId) {
      throw new BadRequestException('Document id is required');
    }
    await this.documentsService.verifyUserAccessAndGetDocument(userId, documentId);

    const { data: flashcardsSets } = await this.supabase
      .from('flashcards_sets')
      .select('*, cards: flashcards(answer, question, page_number)')
      .eq('document_id', documentId)
      .order('created_at', { ascending: false });

    return flashcardsSets;
  }

  public async reviewFlashcardsSet(userId: string, setId: number) {
    await this.validateExistenceAndUserAccess(userId, setId);

    const { error, status } = await this.supabase
      .from('flashcards_sets')
      .update({
        reviewed_at: 'NOW()',
      })
      .eq('id', setId);
    if (error) {
      throw new HttpException(error.message, status);
    }

    return { status: HttpStatus.OK, message: 'Flashcards reviewed successfully' };
  }

  private async validateExistenceAndUserAccess(userId: string, setId: number) {
    const { data: flashcardsSet } = await this.supabase
      .from('flashcards_sets')
      .select('*, document: documents(user_id)')
      .eq('id', setId)
      .single();
    if (!flashcardsSet) {
      throw new HttpException('Flashcards not found', HttpStatus.NOT_FOUND);
    }
    if (flashcardsSet.document.user_id != userId) {
      throw new HttpException('Forbidden', HttpStatus.FORBIDDEN);
    }
  }

  public async deleteFlashcardsSet(userId: string, setId: number) {
    await this.validateExistenceAndUserAccess(userId, setId);

    const { error, status } = await this.supabase.from('flashcards_sets').delete().eq('id', setId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    return { status: HttpStatus.OK, message: 'Flashcards deleted successfully' };
  }

  private async validateUsageLimits(userId: string, aiPromptsCount: number = 1) {
    await this.statsService.registerAiPromptsUsage(userId, aiPromptsCount);
  }
}
