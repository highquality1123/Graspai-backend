import { BadRequestException, HttpException, HttpStatus, Injectable } from '@nestjs/common';

import { SupabaseClient } from '@supabase/supabase-js';
import { ChatPromptTemplate, MessagesPlaceholder } from 'langchain/prompts';
import { StringOutputParser } from 'langchain/schema/output_parser';
import { RunnableSequence } from 'langchain/schema/runnable';
import { getChatPrompt } from 'src/prompts/getChatPrompt';
import { StreamGateway } from 'src/stream.gateway';
import { HumanMessage, AIMessage } from '@langchain/core/messages';
import { v4 } from 'uuid';
import { DocumentDto } from 'src/modules/documents/model/DocumentDto';
import { getExplanationPrompt } from 'src/prompts/getExplanationPrompt';
import { getSummaryPrompt } from 'src/prompts/getSummaryPrompt';
import { getChapterNamesForSummaryPrompt } from 'src/prompts/getChapterNamesForSummaryPrompt';
import formatter from 'src/services/formatter';
import { ChatTypeEnum } from 'src/modules/chat/model/ChatTypeEnum';
import { StatsService } from '../stats/stats.service';
import { AiService } from '../ai/ai.service';
import { SupabaseService } from '../supabase/supabase.service';

const RETRIEVER_PAGES_COUNT = 10;
const CHAT_HISTORY_MESSAGES_COUNT = 10;

@Injectable()
export class ChatService {
  private supabase: SupabaseClient;

  constructor(
    private readonly streamService: StreamGateway,
    private readonly statsService: StatsService,
    private readonly aiService: AiService,
    private readonly supabaseService: SupabaseService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  public async createChat(title: string, documentId: string, userId: string, type: ChatTypeEnum, source: string) {
    await this.verifyUserAccessAndGetDocument(userId, documentId);

    if (!Object.values(ChatTypeEnum).includes(type)) {
      throw new HttpException('Invalid chat type', HttpStatus.INTERNAL_SERVER_ERROR);
    }

    if (type == ChatTypeEnum.SUMMARY) {
      throw new HttpException('Please use POST /chats/summary endpoint', HttpStatus.BAD_REQUEST);
    }

    const chat = {
      id: v4(),
      user_id: userId,
      document_id: documentId,
      title,
      type,
      source,
    };
    const { error } = await this.supabase.from('chats').insert(chat);

    if (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    return {
      chatId: chat.id,
    };
  }

  public async createDocumentSummary(userId: string, documentId: string) {
    await this.verifyUserAccessAndGetDocument(userId, documentId);
    const summaryChatsForTheDocument = await this.supabase
      .from('chats')
      .select('*')
      .match({ document_id: documentId, type: ChatTypeEnum.SUMMARY });
    if (summaryChatsForTheDocument.data.length > 0) {
      throw new HttpException("You can't request summary for the same document twice", HttpStatus.BAD_REQUEST);
    }
    await this.validateUsageLimits(userId);

    const chat = {
      id: v4(),
      user_id: userId,
      document_id: documentId,
      title: 'Summary',
      type: ChatTypeEnum.SUMMARY,
      source: '',
    };
    const { error } = await this.supabase.from('chats').insert(chat);
    if (error) {
      throw new HttpException(error.message, HttpStatus.INTERNAL_SERVER_ERROR);
    }

    const retrievedDocuments = await this.getDocumentPiecesForSummary(documentId);

    const chapterNamesPromptTemplate = await getChapterNamesForSummaryPrompt();
    const chapterNamesChain = this.buildChain(retrievedDocuments, chapterNamesPromptTemplate);
    const chapterNamesResponse = await chapterNamesChain.invoke({
      question: '',
      chat_history: [],
    });
    const chapterNames: string[] = formatter.parseJSONFromAI(chapterNamesResponse);

    const summaryPromptTemplate = await getSummaryPrompt(chapterNames);
    const summaryChain = this.buildChain(retrievedDocuments, summaryPromptTemplate);
    const response = await summaryChain.invoke({
      question: '',
      chat_history: [],
    });

    const historyData = {
      chat_id: chat.id,
      question: 'Summary',
      response,
      source: [],
    };

    await this.supabase.from('chat_messages').insert(historyData);

    return {
      chatId: chat.id,
      response: formatter.parseJSONFromAI(response),
    };
  }

  public async createChatMessage(userId: string, chatId: string, question: string) {
    if (!userId) throw new BadRequestException('User id is required');
    if (!chatId) throw new BadRequestException('Chat id is required');
    if (!question) throw new BadRequestException('Question is required');

    const chat = await this.verifyUserAccessAndGetChat(userId, chatId);
    await this.verifyUserAccessAndGetDocument(userId, chat.document_id);
    if (chat.type == ChatTypeEnum.SUMMARY) {
      throw new BadRequestException("You can't chat the summary");
    }

    await this.validateUsageLimits(userId);

    const sanitizedQuestion = question.trim().replaceAll('\n', ' ') as string;
    const chatHistoryMessages = await this.getChatHistoryForLLM(chat);

    let promptTemplate = await this.buildChatPromptTemplate(
      chat.type,
      sanitizedQuestion,
      chatHistoryMessages.length !== 0,
    );

    const retrievedDocuments = await this.aiService.getRelevantDocumentPieces(
      chat.document_id,
      sanitizedQuestion,
      RETRIEVER_PAGES_COUNT,
    );

    const chain = this.buildChain(retrievedDocuments, promptTemplate);

    const stream = await chain.stream({
      question: sanitizedQuestion,
      chat_history: chatHistoryMessages,
    });

    let response = '';
    for await (const chunk of stream) {
      this.streamService.handleMessage(chatId, { message: chunk as string });
      response += chunk || '';
    }

    const historyData = {
      chat_id: chatId,
      question,
      response,
      source: chat.type == ChatTypeEnum.SUMMARY ? [] : retrievedDocuments,
    };

    const res = await this.supabase.from('chat_messages').insert(historyData);

    return { response };
  }

  private async buildChatPromptTemplate(chatType: ChatTypeEnum, sanitizedQuestion: string, hasHistory: boolean) {
    let promptTemplate = '';
    if (hasHistory) {
      promptTemplate = await getChatPrompt(sanitizedQuestion);
    } else {
      if (chatType == ChatTypeEnum.EXPLANATION) {
        promptTemplate = await getExplanationPrompt(sanitizedQuestion);
      } else {
        promptTemplate = await getChatPrompt(sanitizedQuestion);
      }
    }
    return promptTemplate;
  }

  private async getChatHistoryForLLM(chat: any) {
    const chatHistoryRows = await this.supabase
      .from('chat_messages')
      .select('*')
      .match({ chat_id: chat.id })
      .order('created_at', { ascending: false })
      .limit(CHAT_HISTORY_MESSAGES_COUNT);

    const chatHistoryMessages = chatHistoryRows.data
      ?.reverse()
      .map((message: any) => {
        return [new HumanMessage(message?.question), new AIMessage(message?.response)];
      })
      .flat();
    return chatHistoryMessages;
  }

  private async verifyUserAccessAndGetChat(userId: string, chatId: string) {
    const chatQueryResult = await this.supabase.from('chats').select('*').match({ id: chatId });

    if (chatQueryResult.error) {
      throw new HttpException(chatQueryResult.error.message, chatQueryResult.status);
    }

    if (!chatQueryResult.data || chatQueryResult.data.length === 0) {
      throw new HttpException('Chat not found', 404);
    }

    const chat = chatQueryResult.data[0];

    if (chat.user_id != userId) {
      throw new HttpException('Unauthorized', 401);
    }

    return chat;
  }

  private async getDocumentPiecesForSummary(documentId: string) {
    const chatModelMaxInputTokensCount = this.aiService.getModelMaxInputTokensCount();
    const pages = await this.supabase
      .from('embeddings')
      .select('token, content, metadata->page_number')
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

    const model = this.aiService.getModel();

    const answerChain: any = RunnableSequence.from([
      {
        context: () => context,
        chat_history: (input) => input.chat_history,
        question: (input) => input.question,
      },
      answerPrompt,
      model,
      new StringOutputParser(),
    ] as any);

    return answerChain;
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

  public async getChatsByDocumentId(userId: string, documentId: string) {
    if (!documentId) throw new BadRequestException('Document id is required');
    if (!userId) throw new BadRequestException('User id is required');

    await this.verifyUserAccessAndGetDocument(userId, documentId);

    const getChatsRequest = await this.supabase
      .from('chats')
      .select('*, chat_messages(id, question, response, created_at)')
      .match({ user_id: userId, document_id: documentId })
      .order('created_at', { referencedTable: 'chat_messages', ascending: true })
      .limit(1, { referencedTable: 'chat_messages' })
      .order('created_at', { ascending: true });

    if (getChatsRequest.error) {
      throw new HttpException(getChatsRequest.error.message, getChatsRequest.status);
    }

    return getChatsRequest.data;
  }

  public async getChatHistory(userId: string, chatId: string) {
    if (!chatId) throw new BadRequestException('Chat id is required');
    if (!userId) throw new BadRequestException('User id is required');

    await this.verifyUserAccessAndGetChat(userId, chatId);

    const getChatMessagesRequest = await this.supabase
      .from('chat_messages')
      .select('id, question, response, created_at')
      .match({ chat_id: chatId })
      .order('created_at', { ascending: true });

    if (getChatMessagesRequest.error) {
      throw new HttpException(getChatMessagesRequest.error.message, getChatMessagesRequest.status);
    }

    return getChatMessagesRequest.data;
  }

  public async deleteChat(userId: string, chatId: string) {
    if (!chatId) throw new BadRequestException('Chat id is required');
    if (!userId) throw new BadRequestException('User id is required');

    try {
      const chat = await this.verifyUserAccessAndGetChat(userId, chatId);
      if (chat.type == ChatTypeEnum.SUMMARY) {
        throw new HttpException("You're not allowed to delete the document summary", HttpStatus.BAD_REQUEST);
      }

      const { error, status } = await this.supabase.from('chats').delete().eq('id', chatId);

      if (error) {
        console.log('[Supabase] DELETE Chat Error: ', error.message, status);
        throw new HttpException(error.message, status);
      }

      return { message: 'Chat deleted' };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }

  // TODO: move to separate DAL layer in documents module
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

  private async validateUsageLimits(userId: string, aiPromptsCount: number = 1) {
    await this.statsService.registerAiPromptsUsage(userId, aiPromptsCount);
  }
}
