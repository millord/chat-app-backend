import { HttpException, HttpStatus, Injectable } from '@nestjs/common';

@Injectable()
export class ChatService {
  startChat(message: string) {
    if (!message) {
      return new HttpException('Empty message', HttpStatus.BAD_REQUEST);
    }
    try {
      return `Bot: ${message}`;
    } catch (error) {
      if (error instanceof Error) {
        throw new Error('Could not create chat', error);
      }
    }
  }
}
