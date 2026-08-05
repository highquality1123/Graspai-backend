import { HttpException, Injectable } from '@nestjs/common';
import OpenAI from 'openai';
import Groq from 'groq-sdk';
import { SupabaseClient } from '@supabase/supabase-js';
import { DocumentDto } from '../documents/model/DocumentDto';
import { DocumentSourceTypeEnum } from '../documents/model/DocumentSourceTypeEnum';
import { RecursiveCharacterTextSplitter } from 'langchain/text_splitter';
import formatter from 'src/services/formatter';
import { ChatOpenAI } from 'langchain/chat_models/openai';
import { LanguageEnum } from '../documents/model/LanguageEnum';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { z } from 'zod';
import { RunnableSequence } from 'langchain/schema/runnable';
import { getChapterNamesPrompt } from 'src/prompts/getChapterNamesPrompt';
import { enrichUserQueryForVideoGenerationPrompt } from 'src/prompts/enrichUserQueryForVideoGenerationPrompt';
import { SupabaseService } from '../supabase/supabase.service';

const CHUNK_CHARS_COUNT = 1000;
const CHUNK_CHARS_OVERLAP = 200;

const EMBEDDINGS_MODEL = 'text-embedding-3-small';

const CHAT_MODEL = 'gpt-4o-mini';
const CHAT_MODEL_MAX_INPUT_TOKENS = 100_000;
const CHAT_TEMPERATURE = 0.1;
const CHAT_DEBUG_MODE = false; // TODO: disable on production

const GROQ_TRANSCRIPTION_MODEL = 'whisper-large-v3';

type GetDocumentChunksCallback = (
  document: DocumentDto,
  source: any,
  documentSourceType: DocumentSourceTypeEnum,
) => any;

@Injectable()
export class AiService {
  private openAI: OpenAI;
  private groq: Groq;
  private supabase: SupabaseClient;

  constructor(private readonly supabaseService: SupabaseService) {
    this.supabase = this.supabaseService.getClient();
    this.openAI = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY as string,
    });
    this.groq = new Groq({
      apiKey: process.env.GROQ_API_KEY as string,
    });
  }

  public async buildEmbeddings(
    userId: string,
    document: DocumentDto,
    documentSourceType: DocumentSourceTypeEnum,
    source: any,
    getDocumentChunks: GetDocumentChunksCallback,
  ) {
    console.log('[Documents] Calculating embeddings for document', document.name);

    let documentChunks = await getDocumentChunks(document, source, documentSourceType);
    const splittedChunks = await this.getSplittedChunks(documentChunks);

    var { documentLength, documentTokens, chunkEmbeddings } = await this.getEmbeddings(
      userId,
      document,
      splittedChunks,
    );

    await this.saveEmbeddings(splittedChunks, documentLength, documentTokens, document, userId, chunkEmbeddings);
  }

  private async getSplittedChunks(chunks: any) {
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: CHUNK_CHARS_COUNT,
      chunkOverlap: CHUNK_CHARS_OVERLAP,
    });
    const splittedChunks = await textSplitter.createDocuments(
      chunks.map((chunk) => chunk.content),
      chunks.map((chunk) => {
        return {
          ...chunk,
          content: '',
        };
      }),
    );
    return splittedChunks;
  }

  private async getEmbeddings(userId: string, document: DocumentDto, splittedChunks: any) {
    let documentLength = 0;
    let documentTokens = 0;

    const chunks: any[] = splittedChunks.map((chunk: any) => {
      const sanitizedContent = formatter.sanitizeTextForAI(chunk.pageContent || '');
      const pageContent = `${sanitizedContent}`;

      documentLength += pageContent.length;

      const chunkObject = {
        document_id: document.id,
        embedding: null,
        token: Math.ceil(pageContent.length / 4), // assumption that tokens = characters / 4
        content: pageContent,
        metadata: {
          document_id: chunk.metadata.doc_id,
          page_number: chunk.metadata.page,
          duration: chunk.metadata.duration || 0,
          start: chunk.metadata.start || 0,
          end: chunk.metadata.end || 0,
        },
      };

      return chunkObject;
    });

    // Split chunks into portions to not exceed OpenAI limit of 300 000 input tokens
    const chunksLength = chunks.length;
    const chunksPortionLength = 300;
    let chunksOffset = 0;
    while (chunksOffset < chunksLength) {
      const chunksPortion = chunks.slice(chunksOffset, chunksOffset + chunksPortionLength);

      const embeddingsRes = await this.openAI.embeddings.create({
        model: EMBEDDINGS_MODEL,
        input: chunksPortion.map((c) => c.content),
        encoding_format: 'float',
        user: userId,
      });
      documentTokens += embeddingsRes.usage.total_tokens;

      embeddingsRes.data.forEach((embedding) => {
        const pageVector = embedding.embedding;
        chunks[chunksOffset + embedding.index].embedding = pageVector;
      });

      chunksOffset += chunksPortionLength;
    }

    return { documentLength, documentTokens, chunkEmbeddings: chunks };
  }

  private async saveEmbeddings(
    splittedChunks,
    documentLength: number,
    documentTokens: number,
    document: DocumentDto,
    userId: string,
    chunkEmbeddings: any[],
  ) {
    const updateDocumentQueryResult = await this.supabase
      .from('documents')
      .update({
        pages_count: splittedChunks.length || 0,
        length: documentLength || 0,
        tokens: documentTokens || 0,
      })
      .eq('id', document.id)
      .eq('user_id', userId);
    if (updateDocumentQueryResult.error) {
      console.log('[Documents] Document update failed', updateDocumentQueryResult.error);
      throw new HttpException(updateDocumentQueryResult.error.message, updateDocumentQueryResult.status);
    }

    const insertEmbeddingsQueryResult = await this.supabase.from('embeddings').insert(chunkEmbeddings);
    if (insertEmbeddingsQueryResult.error) {
      console.log('[Documents] Embeddings insert failed', insertEmbeddingsQueryResult.error);
      throw new HttpException(insertEmbeddingsQueryResult.error.message, insertEmbeddingsQueryResult.status);
    }
  }

  public async getRelevantDocumentPieces(documentId: string, query: string, piecesCount: number) {
    const embeddingsRes = await this.openAI.embeddings.create({
      model: EMBEDDINGS_MODEL,
      input: query,
      encoding_format: 'float',
    });
    const queryVector = embeddingsRes.data[0].embedding;
    const res = await this.supabase.rpc('search_vectors', {
      query_embedding: queryVector,
      query_document_id: documentId,
      match_count: piecesCount,
    });

    return res.data;
  }

  public async getRandomDocumentPieces(documentId: string, piecesCount: number) {
    const res = await this.supabase.rpc('get_random_embeddings', {
      query_document_id: documentId,
      match_count: piecesCount,
    });

    return res.data;
  }

  public getModel(modelName = null, temperature = null, debug = null) {
    const model = new ChatOpenAI({
      modelName: modelName ?? CHAT_MODEL,
      temperature: temperature ?? CHAT_TEMPERATURE,
      verbose: debug ?? CHAT_DEBUG_MODE,
    });
    return model;
  }

  public getModelMaxInputTokensCount() {
    return CHAT_MODEL_MAX_INPUT_TOKENS;
  }

  public async transcribeAudioFile(audioFile: File, language: LanguageEnum) {
    const transcriptionRes = await this.groq.audio.transcriptions.create({
      file: audioFile,
      model: GROQ_TRANSCRIPTION_MODEL,
      language,
      response_format: 'verbose_json',
      timestamp_granularities: ['segment'],
    });

    return transcriptionRes as any;
  }

  public async transcribeAudioChunk(audioFile: File, language: LanguageEnum) {
    const transcriptionRes = await this.groq.audio.transcriptions.create({
      file: audioFile,
      model: GROQ_TRANSCRIPTION_MODEL,
      language,
      response_format: 'verbose_json',
      prompt: 'If the audio is silent return an empty string',
    });

    return transcriptionRes.text;
  }

  public async generateChapters(userId: string, documentId: string) {
    console.log('[Documents] Generating chapters');
    await this.verifyUserAccessAndGetDocument(userId, documentId);

    const retrievedDocuments = await this.getDocumentPiecesForChapters(documentId);

    const documentsResponse = await this.supabase
      .from('documents')
      .select('*')
      .eq('id', documentId);
    const language = documentsResponse.data[0]?.language || 'en';

    const maxChapterNames = Math.round(retrievedDocuments.length / 10.0) || 1;
    const chapterNamesPromptTemplate = await getChapterNamesPrompt(maxChapterNames, language);
    const chapterNamesChain = this.buildChain(retrievedDocuments, chapterNamesPromptTemplate);
    const chapterNamesResponse = await chapterNamesChain.invoke({
      question: '',
      chat_history: [],
    });
    const chapters: [] = chapterNamesResponse?.items;
    
    const insertChaptersQueryResult = await this.supabase.from('chapters').insert({
      document_id: documentId,
      chapters,
    });
    if (insertChaptersQueryResult.error) {
      console.log('[Documents] Chapters insert failed', insertChaptersQueryResult.error);
      throw new HttpException(insertChaptersQueryResult.error.message, insertChaptersQueryResult.status);
    }

    return chapters;
  }

  private async verifyUserAccessAndGetDocument(userId: string, documentId: string) {
    const document = await this.getDocumentById(documentId);
    if (document.user_id != userId) {
      throw new HttpException('Unauthorized', 401);
    }
    return document;
  }

  private async getDocumentById(documentId: string): Promise<DocumentDto> {
    const { data: documents, error, status } = await this.supabase.from('documents').select('*').eq('id', documentId);

    if (error) {
      throw new HttpException(error.message, status);
    }

    if (!documents || documents.length === 0) {
      throw new HttpException('Document not found', 404);
    }

    return documents[0];
  }

  private async getDocumentPiecesForChapters(documentId: string) {
    const chatModelMaxInputTokensCount = this.getModelMaxInputTokensCount();
    const pages = await this.supabase
      .from('embeddings')
      .select('token, content, metadata->page_number, metadata->start')
      .match({ document_id: documentId })
      .order('metadata->page_number', { ascending: true });
    const tokensCount = pages.data.reduce((acc, val) => acc + val.token, 0);
    let filteredPages = [];
    if (tokensCount > chatModelMaxInputTokensCount) {
      const pageFilterDivider = Math.ceil(tokensCount / chatModelMaxInputTokensCount);
      filteredPages = pages.data.filter((page) => Number(page.page_number) % pageFilterDivider === 1);
    } else {
      filteredPages = pages.data;
    }
    filteredPages = filteredPages.map((page) => {
      return {
        content: page.content,
        metadata: {
          page_number: page.page_number,
          start: page.start,
        },
      };
    });
    return filteredPages;
  }

  private buildChain(retrievedDocuments: any, promptTemplate: string) {
    const context = this.combineDocuments(retrievedDocuments);

    const answerPrompt = ChatPromptTemplate.fromMessages([
      ['system', promptTemplate as string],
      new MessagesPlaceholder('chat_history'),
      ['human', '{question}'],
    ]);

    const model = this.getModel();

    const answerChain: any = RunnableSequence.from([
      {
        context: () => context,
        chat_history: (input) => input.chat_history,
        question: (input) => input.question,
      },
      answerPrompt,
      model.withStructuredOutput(
        z.object({
          items: z.array(
            z.object({
              name: z.string().describe('The chapter name'),
              page_number: z.number().describe('The page number where the chapter starts'),
              start: z
                .number()
                .describe(
                  'If there are time labels in the context, this is the time label of the page where the chapter starts',
                ),
            }),
          ),
        }),
      ),
    ] as any);

    return answerChain;
  }

  private combineDocuments(docs, separator = '\n\n') {
    const serializedDocs = docs.map((page) => {
      const pageContent =
        '$$Start Of Page No ' +
        page.metadata.page_number +
        (page.metadata.start !== undefined ? '$$Time ' + page.metadata.start : '') +
        '$$' +
        page.content +
        '$$End Of Page No ' +
        page.metadata.page_number +
        '$$';
      return pageContent;
    });
    return serializedDocs.join(separator);
  }

  public async enrichUserPromptWithDocumentRAG(userQuery: string, documentId: string): Promise<string> {
    try {
      const { data: document, error: docError } = await this.supabase
        .from('documents')
        .select('language')
        .eq('id', documentId)
        .single();

      if (docError || !document) {
        console.error('Error fetching document language:', docError);
        return userQuery;
      }

      const relevantPieces = await this.getRelevantDocumentPieces(
        documentId,
        userQuery,
        10
      );

      if (!relevantPieces || relevantPieces.length === 0) {
        console.log("No relevant document pieces found, using original query");
        return userQuery;
      }

      // Combine document pieces into context
      const documentContext = relevantPieces
        .map((piece: any) => piece.content)
        .join('\n\n');

      // Create a prompt to enrich the user query with document context
      const enrichmentPrompt = enrichUserQueryForVideoGenerationPrompt(userQuery, documentContext, document.language);

      const response = await this.openAI.chat.completions.create({
        model: CHAT_MODEL,
        messages: [
          {
            role: 'user',
            content: enrichmentPrompt,
          },
        ],
        temperature: 0.2,
        max_completion_tokens: 100,
      });

      const enrichedPrompt = response.choices[0]?.message?.content?.trim();

      if (!enrichedPrompt) {
        console.log("Failed to generate enriched prompt, using original query");
        return userQuery;
      }

      console.log("Original query:", userQuery);
      console.log("Enriched prompt:", enrichedPrompt);

      return enrichedPrompt;

    } catch (error) {
      console.error("Error enriching user prompt with document RAG:", error);
      // Fallback to original query if enrichment fails
      return userQuery;
    }
  }
}
