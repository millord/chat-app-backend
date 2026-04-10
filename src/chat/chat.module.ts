import { Module } from '@nestjs/common';
import { ChatController } from './chat.controller';
import { SessionService } from './session.service';
import { LlmService } from './llm.service';

@Module({
  controllers: [ChatController],
  providers: [SessionService, LlmService],
})
export class ChatModule {}
