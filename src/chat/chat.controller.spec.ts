import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
// eslint-disable-next-line @typescript-eslint/no-require-imports
const request = require('supertest') as typeof import('supertest').default;
import { ChatController } from './chat.controller';
import { SessionService } from './session.service';
import { LlmService } from './llm.service';
import { HttpExceptionFilter } from '../filters/http-exception.filter';
import { NotFoundException, GoneException } from '@nestjs/common';

async function* tokenStream(tokens: string[]): AsyncIterable<string> {
  for (const t of tokens) yield t;
}

describe('ChatController', () => {
  let app: INestApplication;
  let sessionService: jest.Mocked<SessionService>;
  let llmService: jest.Mocked<LlmService>;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ChatController],
      providers: [
        {
          provide: SessionService,
          useValue: {
            create: jest.fn(),
            getHistory: jest.fn(),
            storeReply: jest.fn(),
            delete: jest.fn(),
          },
        },
        {
          provide: LlmService,
          useValue: { streamReply: jest.fn() },
        },
      ],
    }).compile();

    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
    app.useGlobalFilters(new HttpExceptionFilter());
    await app.init();

    sessionService = module.get(SessionService);
    llmService = module.get(LlmService);
  });

  afterEach(() => app.close());

  describe('POST /chat/session', () => {
    it('returns 201 with sessionId', async () => {
      sessionService.create.mockReturnValue('test-session-id');
      const res = await request(app.getHttpServer()).post('/chat/session');
      expect(res.status).toBe(201);
      expect(res.body).toEqual({ sessionId: 'test-session-id' });
    });
  });

  describe('POST /chat/:sessionId/message', () => {
    it('streams tokens and sends done event for valid session', async () => {
      sessionService.getHistory.mockReturnValue([]);
      sessionService.storeReply.mockReturnValue({ turnIndex: 0 });
      llmService.streamReply.mockReturnValue(tokenStream(['Hello', ' world']));

      const res = await request(app.getHttpServer())
        .post('/chat/test-id/message')
        .send({ message: 'hi' })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => cb(null, data));
        });

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.body).toContain('data: {"token":"Hello"}');
      expect(res.body).toContain('data: {"token":" world"}');
      expect(res.body).toContain('"done":true');
      expect(res.body).toContain('"turnIndex":0');
    });

    it('returns 404 for unknown session', async () => {
      sessionService.getHistory.mockImplementation(() => {
        throw new NotFoundException('Session not found');
      });
      const res = await request(app.getHttpServer())
        .post('/chat/bad-id/message')
        .send({ message: 'hi' });
      expect(res.status).toBe(404);
    });

    it('returns 410 for expired session', async () => {
      sessionService.getHistory.mockImplementation(() => {
        throw new GoneException('Session has expired');
      });
      const res = await request(app.getHttpServer())
        .post('/chat/old-id/message')
        .send({ message: 'hi' });
      expect(res.status).toBe(410);
    });

    it('emits error event on LLM failure', async () => {
      sessionService.getHistory.mockReturnValue([]);
      llmService.streamReply.mockReturnValue(
        (async function* () {
          throw new Error('LLM down');
        })(),
      );

      const res = await request(app.getHttpServer())
        .post('/chat/test-id/message')
        .send({ message: 'hi' })
        .buffer(true)
        .parse((res, cb) => {
          let data = '';
          res.on('data', (chunk: Buffer) => (data += chunk.toString()));
          res.on('end', () => cb(null, data));
        });

      expect(res.headers['content-type']).toContain('text/event-stream');
      expect(res.body).toContain('"error":"LLM unavailable"');
    });
  });
});
