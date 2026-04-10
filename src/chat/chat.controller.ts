import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  Param,
  Post,
  Res,
} from '@nestjs/common';
import type { Response } from 'express';
import { SessionService } from './session.service';
import { LlmService } from './llm.service';
import { SendMessageDto } from 'src/dto/send-message.dto';

@Controller('chat')
export class ChatController {
  constructor(
    private readonly sessionService: SessionService,
    private readonly llmService: LlmService,
  ) {}

  @Post('session')
  @HttpCode(201)
  createSession(): { sessionId: string } {
    const sessionId = this.sessionService.create();
    return { sessionId };
  }

  @Post(':sessionId/message')
  async sendMessage(
    @Param('sessionId') sessionId: string,
    @Body() body: SendMessageDto,
    @Res({ passthrough: false }) res: Response,
  ): Promise<void> {
    // Validate session BEFORE flushing headers so 404/410 are handled by the exception filter
    const history = this.sessionService.getHistory(sessionId);

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    let fullReply = '';
    try {
      for await (const token of this.llmService.streamReply(history, body.message)) {
        fullReply += token;
        res.write(`data: ${JSON.stringify({ token })}\n\n`);
      }
      const { turnIndex } = this.sessionService.storeReply(
        sessionId,
        body.message,
        fullReply,
      );
      res.write(`data: ${JSON.stringify({ done: true, turnIndex })}\n\n`);
    } catch {
      res.write(`data: ${JSON.stringify({ error: 'LLM unavailable' })}\n\n`);
    } finally {
      res.end();
    }
  }

  @Get(':sessionId/history')
  getHistory(@Param('sessionId') sessionId: string) {
    return { turns: this.sessionService.getHistory(sessionId) };
  }

  @Delete(':sessionId')
  @HttpCode(204)
  deleteSession(@Param('sessionId') sessionId: string): void {
    this.sessionService.delete(sessionId);
  }
}
