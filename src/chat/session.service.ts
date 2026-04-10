import { GoneException, Injectable, NotFoundException } from '@nestjs/common';
import { v4 as uuidv4 } from 'uuid';

export interface Turn {
  role: 'user' | 'bot';
  text: string;
  timestamp: Date;
}

interface Session {
  id: string;
  turns: Turn[];
  lastActivity: Date;
}

const SESSION_TIMEOUT_MS = 30 * 60 * 1000; // 30 minutes

@Injectable()
export class SessionService {
  private readonly sessions = new Map<string, Session>();

  create(): string {
    const id = uuidv4();
    this.sessions.set(id, { id, turns: [], lastActivity: new Date() });
    return id;
  }

  private getSession(sessionId: string): Session {
    const session = this.sessions.get(sessionId);
    if (!session) throw new NotFoundException('Session not found');

    const idleMs = Date.now() - session.lastActivity.getTime();
    if (idleMs > SESSION_TIMEOUT_MS) {
      this.sessions.delete(sessionId);
      throw new GoneException('Session has expired');
    }

    return session;
  }

  addMessage(
    sessionId: string,
    message: string,
  ): { reply: string; turnIndex: number } {
    const session = this.getSession(sessionId);

    session.turns.push({ role: 'user', text: message, timestamp: new Date() });

    const reply = `Bot: ${message}`;
    session.turns.push({ role: 'bot', text: reply, timestamp: new Date() });
    session.lastActivity = new Date();

    const turnIndex = Math.floor(session.turns.length / 2) - 1;
    return { reply, turnIndex };
  }

  storeReply(
    sessionId: string,
    userMessage: string,
    botReply: string,
  ): { turnIndex: number } {
    const session = this.getSession(sessionId);
    session.turns.push({ role: 'user', text: userMessage, timestamp: new Date() });
    session.turns.push({ role: 'bot', text: botReply, timestamp: new Date() });
    session.lastActivity = new Date();
    return { turnIndex: Math.floor(session.turns.length / 2) - 1 };
  }

  getHistory(sessionId: string): Turn[] {
    return this.getSession(sessionId).turns;
  }

  delete(sessionId: string): void {
    if (!this.sessions.has(sessionId))
      throw new NotFoundException('Session not found');
    this.sessions.delete(sessionId);
  }
}
