import { LlmService, LlmUnavailableError } from './llm.service';

// --- Mocks ---

const mockGenerateContent = jest.fn();
const mockGenerateContentStream = jest.fn();
const mockGetGenerativeModel = jest.fn().mockReturnValue({
  generateContent: mockGenerateContent,
  generateContentStream: mockGenerateContentStream,
});

jest.mock('@google/generative-ai', () => ({
  GoogleGenerativeAI: jest.fn().mockImplementation(() => ({
    getGenerativeModel: mockGetGenerativeModel,
  })),
  SchemaType: { OBJECT: 'OBJECT', STRING: 'STRING' },
}));

async function* makeStream(tokens: string[]) {
  for (const token of tokens) {
    yield { text: () => token };
  }
}

// Helper: collect all tokens from streamReply
async function collectTokens(
  service: LlmService,
  history: any[],
  message: string,
): Promise<string[]> {
  const tokens: string[] = [];
  for await (const t of service.streamReply(history, message)) {
    tokens.push(t);
  }
  return tokens;
}

describe('LlmService', () => {
  let service: LlmService;

  beforeAll(() => {
    process.env.LLM_API_KEY = 'test-key';
    process.env.LLM_MODEL = 'gemini-2.0-flash';
  });

  afterAll(() => {
    delete process.env.LLM_API_KEY;
    delete process.env.LLM_MODEL;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    service = new LlmService();
  });

  describe('streamReply() — no tool call', () => {
    it('yields tokens from the stream', async () => {
      // generateContent returns no functionCall → skip loop
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [{ text: 'ok' }] } }] },
      });
      mockGenerateContentStream.mockResolvedValue({
        stream: makeStream(['Hello', ' world']),
      });

      const tokens = await collectTokens(service, [], 'hi');
      expect(tokens).toEqual(['Hello', ' world']);
    });

    it('maps bot history role to "model"', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [] } }] },
      });
      mockGenerateContentStream.mockResolvedValue({ stream: makeStream(['ok']) });

      await collectTokens(
        service,
        [
          { role: 'user', text: 'hey', timestamp: new Date() },
          { role: 'bot', text: 'hi', timestamp: new Date() },
        ],
        'again',
      );

      const callContents = mockGenerateContentStream.mock.calls[0][0].contents as any[];
      expect(callContents[0].role).toBe('user');
      expect(callContents[1].role).toBe('model');
    });
  });

  describe('streamReply() — with tool call', () => {
    it('resolves tool call before streaming and calls generateContent twice', async () => {
      // First call returns a functionCall
      mockGenerateContent
        .mockResolvedValueOnce({
          response: {
            candidates: [
              {
                content: {
                  parts: [
                    { functionCall: { name: 'get_department_info', args: { department: 'engineering' } } },
                  ],
                },
              },
            ],
          },
        })
        // Second call returns no functionCall
        .mockResolvedValueOnce({
          response: { candidates: [{ content: { parts: [{ text: 'result' }] } }] },
        });

      mockGenerateContentStream.mockResolvedValue({ stream: makeStream(['Done']) });

      const tokens = await collectTokens(service, [], 'department info');
      expect(tokens).toEqual(['Done']);
      expect(mockGenerateContent).toHaveBeenCalledTimes(2);

      // Second generateContent call should include the functionResponse
      const secondCallContents = mockGenerateContent.mock.calls[1][0].contents as any[];
      const fnResponsePart = secondCallContents
        .flatMap((c: any) => c.parts)
        .find((p: any) => p.functionResponse);
      expect(fnResponsePart).toBeDefined();
      expect(fnResponsePart.functionResponse.name).toBe('get_department_info');
      const output = JSON.parse(fnResponsePart.functionResponse.response.output);
      expect(output.headcount).toBe(42);
    });
  });

  describe('streamReply() — LLM error', () => {
    it('throws LlmUnavailableError when generateContentStream rejects', async () => {
      mockGenerateContent.mockResolvedValue({
        response: { candidates: [{ content: { parts: [] } }] },
      });
      mockGenerateContentStream.mockRejectedValue(new Error('network error'));

      await expect(collectTokens(service, [], 'hi')).rejects.toThrow(LlmUnavailableError);
    });

    it('throws LlmUnavailableError when generateContent rejects', async () => {
      mockGenerateContent.mockRejectedValue(new Error('quota exceeded'));
      await expect(collectTokens(service, [], 'hi')).rejects.toThrow(LlmUnavailableError);
    });
  });
});
