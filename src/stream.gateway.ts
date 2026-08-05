// NestJS Imports
import { OnModuleInit } from '@nestjs/common';
import {
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

// Socket.io imports
import { Server } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: ['http://localhost:3000', 'https://graspr.vercel.app/'],
    methods: ['GET', 'POST'],
  },
})
export class StreamGateway implements OnModuleInit {
  @WebSocketServer()
  server: Server;

  onModuleInit() {
    this.server.on('connection', () => {
      
    });
  }

  @SubscribeMessage('message')
  handleMessage(
    @MessageBody()
    chatID: string,
    data: { message: string },
  ): void {
    this.server.emit(chatID, data);
    return;
  }
}
