import { Test, TestingModule } from '@nestjs/testing';
import { NotFoundException, GoneException } from '@nestjs/common';
import { SessionService } from './session.service';

describe('SessionService', () => {
  let service: SessionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SessionService],
    }).compile();
    service = module.get<SessionService>(SessionService);
  });

  describe('create()', () => {
    it('returns a UUID string', () => {
      const id = service.create();
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/);
    });

    it('returns unique IDs on each call', () => {
      expect(service.create()).not.toBe(service.create());
    });
  });

  describe('getHistory()', () => {
    it('returns empty array for new session', () => {
      const id = service.create();
      expect(service.getHistory(id)).toEqual([]);
    });

    it('throws NotFoundException for unknown session', () => {
      expect(() => service.getHistory('unknown-id')).toThrow(NotFoundException);
    });

    it('throws GoneException for expired session', () => {
      const id = service.create();
      const sessions = (service as any).sessions as Map<string, any>;
      const session = sessions.get(id)!;
      session.lastActivity = new Date(Date.now() - 31 * 60 * 1000);
      expect(() => service.getHistory(id)).toThrow(GoneException);
    });
  });

  describe('storeReply()', () => {
    it('stores user and bot turns and returns correct turnIndex', () => {
      const id = service.create();
      const result = service.storeReply(id, 'Hello', 'Hi there');
      expect(result.turnIndex).toBe(0);
      const turns = service.getHistory(id);
      expect(turns).toHaveLength(2);
      expect(turns[0]).toMatchObject({ role: 'user', text: 'Hello' });
      expect(turns[1]).toMatchObject({ role: 'bot', text: 'Hi there' });
    });

    it('returns incrementing turnIndex on subsequent calls', () => {
      const id = service.create();
      service.storeReply(id, 'A', 'B');
      const { turnIndex } = service.storeReply(id, 'C', 'D');
      expect(turnIndex).toBe(1);
    });

    it('throws GoneException for expired session', () => {
      const id = service.create();
      const sessions = (service as any).sessions as Map<string, any>;
      sessions.get(id)!.lastActivity = new Date(Date.now() - 31 * 60 * 1000);
      expect(() => service.storeReply(id, 'x', 'y')).toThrow(GoneException);
    });
  });

  describe('delete()', () => {
    it('removes the session', () => {
      const id = service.create();
      service.delete(id);
      expect(() => service.getHistory(id)).toThrow(NotFoundException);
    });

    it('throws NotFoundException for unknown session', () => {
      expect(() => service.delete('no-such-id')).toThrow(NotFoundException);
    });
  });
});
