import { Injectable } from '@nestjs/common';
import {
  GoogleGenerativeAI,
  Content,
  FunctionDeclaration,
  SchemaType,
  Part,
} from '@google/generative-ai';
import { Turn } from './session.service';

export class LlmUnavailableError extends Error {
  constructor(cause?: unknown) {
    super('LLM unavailable');
    this.name = 'LlmUnavailableError';
    if (cause instanceof Error) this.cause = cause;
  }
}

const GET_DEPT_TOOL: FunctionDeclaration = {
  name: 'get_department_info',
  description: 'Returns basic information about a company department such as headcount, lead, and budget.',
  parameters: {
    type: SchemaType.OBJECT,
    properties: {
      department: {
        type: SchemaType.STRING,
        description: 'The name of the department (e.g. engineering, hr, sales)',
      },
    },
    required: ['department'],
  },
};

const DEPT_DATA: Record<string, { headcount: number; lead: string; budget: string }> = {
  engineering: { headcount: 42, lead: 'Alice Chen', budget: '$4.2M' },
  hr: { headcount: 8, lead: 'Marcus Webb', budget: '$800K' },
  sales: { headcount: 25, lead: 'Priya Nair', budget: '$2.5M' },
};

function handleGetDepartmentInfo(args: { department: string }): string {
  const key = args.department.toLowerCase();
  const data = DEPT_DATA[key];
  if (!data) return JSON.stringify({ error: 'Department not found' });
  return JSON.stringify({ department: key, ...data });
}

const SYSTEM_PROMPT =
  'You are a helpful assistant for Acme Corp. Answer questions about company departments, ' +
  'general knowledge, and coding. If a question is completely off-topic or harmful, ' +
  'politely decline to answer.';

@Injectable()
export class LlmService {
  private readonly model;

  constructor() {
    const apiKey = process.env.LLM_API_KEY;
    if (!apiKey) throw new Error('LLM_API_KEY environment variable is required');
    const modelName = process.env.LLM_MODEL ?? 'gemini-2.0-flash';
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({
      model: modelName,
      systemInstruction: SYSTEM_PROMPT,
      tools: [{ functionDeclarations: [GET_DEPT_TOOL] }],
    });
  }

  async *streamReply(history: Turn[], newMessage: string): AsyncIterable<string> {
    try {
      // Build conversation contents
      const contents: Content[] = history.map((t) => ({
        role: t.role === 'bot' ? 'model' : 'user',
        parts: [{ text: t.text }],
      }));
      contents.push({ role: 'user', parts: [{ text: newMessage }] });

      // Tool-call resolution loop (synchronous, before streaming)
      let resolvedContents = [...contents];
      for (;;) {
        const result = await this.model.generateContent({ contents: resolvedContents });
        const candidate = result.response.candidates?.[0];
        if (!candidate) break;

        const parts = candidate.content?.parts ?? [];
        const fnCallPart = parts.find((p: Part) => 'functionCall' in p && p.functionCall);
        if (!fnCallPart || !('functionCall' in fnCallPart) || !fnCallPart.functionCall) break;

        const { name, args } = fnCallPart.functionCall;
        let toolResult: string;
        if (name === 'get_department_info') {
          toolResult = handleGetDepartmentInfo(args as { department: string });
        } else {
          toolResult = JSON.stringify({ error: 'Unknown tool' });
        }

        // Append model's tool-call turn and the function response
        resolvedContents = [
          ...resolvedContents,
          { role: 'model', parts },
          {
            role: 'user',
            parts: [{ functionResponse: { name, response: { output: toolResult } } }],
          },
        ];
      }

      // Stream the final reply
      const streamResult = await this.model.generateContentStream({
        contents: resolvedContents,
      });

      for await (const chunk of streamResult.stream) {
        const text = chunk.text();
        if (text) yield text;
      }
    } catch (err) {
      throw new LlmUnavailableError(err);
    }
  }
}
