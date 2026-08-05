import { Body, Controller, Delete, Get, HttpException, HttpStatus, Post, Req } from '@nestjs/common';
import { ApiBody, ApiHeaders, ApiParam, ApiTags } from '@nestjs/swagger';
import { Request } from 'express';
import { ChatService } from './chat.service';
import { SupabaseClient } from '@supabase/supabase-js';
import { SessionService } from '../session/session.service';
import { ChatTypeEnum } from 'src/modules/chat/model/ChatTypeEnum';
import { SupabaseService } from '../supabase/supabase.service';
import { Public } from '../../core/auth/public.decorator';

@ApiTags('chats')
// Legacy V1 : auth gérée en interne (headers access/refresh) — hors garde Bearer V2.
@Public()
@Controller('chats')
export class ChatController {
  supabase: SupabaseClient;

  constructor(
    private readonly chatService: ChatService,
    private readonly supabaseService: SupabaseService,
    private readonly sessionService: SessionService,
  ) {
    this.supabase = this.supabaseService.getClient();
  }

  @Post()
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        title: { type: 'string' },
        documentId: { type: 'string' },
        type: { type: 'string' },
        source: { type: 'string' },
      },
    },
  })
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  async createChat(
    @Body()
    {
      title,
      documentId,
      type,
      source,
    }: {
      title: string;
      documentId: string;
      type: ChatTypeEnum;
      source: string;
    },
    @Req() req: Request,
  ) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    return this.chatService.createChat(title, documentId, user.id, type, source);
  }

  @Post('/summary')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  async createDocumentSummary(
    @Body()
    {
      documentId,
    }: {
      documentId: string;
    },
    @Req() req: Request,
  ) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    return this.chatService.createDocumentSummary(user.id, documentId);
  }

  @Post('/:chatId')
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        question: { type: 'string' },
      },
    },
  })
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'chatId',
    required: true,
  })
  async createChatMessage(
    @Body()
    {
      question,
    }: {
      question: string;
    },
    @Req() req: Request,
  ) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    return this.chatService.createChatMessage(user.id, req.params.chatId, question);
  }

  @Get('/:chatId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'chatId',
    required: true,
  })
  async getChatHistory(@Req() req: Request) {
    const { user: u } = await this.sessionService.getUserSession(req);

    if (!u) {
      throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
    }

    const user = {
      ...u,
      ...u.profile,
    };

    return await this.chatService.getChatHistory(user.id, req.params.chatId);
  }

  @Delete('/:chatId')
  @ApiHeaders([
    {
      name: 'access',
      required: true,
    },
    {
      name: 'refresh',
      required: true,
    },
  ])
  @ApiParam({
    name: 'chatId',
    required: true,
  })
  async deleteChat(@Req() req: Request) {
    try {
      const { user: u } = await this.sessionService.getUserSession(req);

      if (!u) {
        throw new HttpException('Unauthorized', HttpStatus.UNAUTHORIZED);
      }

      const user = {
        ...u,
        ...u.profile,
      };

      await this.chatService.deleteChat(user.id, req.params.chatId);

      return {
        message: 'Chat deleted successfully',
      };
    } catch (error) {
      throw new HttpException(
        error?.message ?? 'Internal Server Error',
        error?.status ?? HttpStatus.INTERNAL_SERVER_ERROR,
      );
    }
  }
}
