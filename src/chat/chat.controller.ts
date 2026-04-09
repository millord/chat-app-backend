import { Body, Controller, Post } from '@nestjs/common';
import { ChatService } from './chat.service';
import { ChatBootDto } from 'src/dto/create.chat.dto';

@Controller('chat')
export class ChatController {
  constructor(private chatService: ChatService) {}
  @Post()
  startChat(@Body() body: ChatBootDto) {
    return this.chatService.startChat(body.message);
  }
}
