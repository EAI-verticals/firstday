import { ChatModule } from '../src/modules/chat';

const mockFetch = jest.fn();
global.fetch = mockFetch;

// Mock crypto.randomUUID
Object.defineProperty(global, 'crypto', {
  value: { randomUUID: () => 'test-uuid-1234' },
});

describe('ChatModule', () => {
  const baseUrl = '/api/eai';
  const streamBaseUrl = '/api/eai/stream';
  const tenantId = 'test-tenant';
  let chat: ChatModule;

  beforeEach(() => {
    chat = new ChatModule(baseUrl, streamBaseUrl, tenantId);
    mockFetch.mockReset();
  });

  describe('stream', () => {
    it('sends POST to stream proxy URL with correct field names', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce({
        ok: true,
        body: mockStream,
      });

      await chat.stream({
        workflowId: 'my-workflow',
        stage: 'chat',
        message: 'Hello world',
        params: { context: 'test' },
      });

      expect(mockFetch).toHaveBeenCalledWith(
        '/api/eai/stream/v4/ai/chat/stream/test-tenant/my-workflow/chat',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: expect.any(String),
        },
      );

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.message).toBe('Hello world');
      expect(body.conversation_id).toBeDefined();
      expect(body.params).toEqual({ context: 'test' });
      // Verify wrong field names are NOT present
      expect(body.chat_input).toBeUndefined();
      expect(body.user_config).toBeUndefined();
      expect(body.thread_id).toBeUndefined();
      expect(body.threadId).toBeUndefined();
    });

    it('auto-generates conversationId if not provided', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockStream });

      await chat.stream({
        workflowId: 'wf',
        stage: 's',
        message: 'test',
        params: {},
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.conversation_id).toBe('test-uuid-1234');
    });

    it('uses provided conversationId', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockStream });

      await chat.stream({
        workflowId: 'wf',
        stage: 's',
        message: 'test',
        conversationId: 'custom-id',
        params: {},
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.conversation_id).toBe('custom-id');
    });

    it('uses streamBaseUrl (not baseUrl)', async () => {
      const mockStream = new ReadableStream();
      mockFetch.mockResolvedValueOnce({ ok: true, body: mockStream });

      await chat.stream({
        workflowId: 'wf',
        stage: 's',
        message: 'test',
        params: {},
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toStartWith('/api/eai/stream/');
      expect(url).not.toStartWith('/api/eai/v3/');
    });
  });

  describe('send', () => {
    it('sends POST to standard proxy URL', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await chat.send({
        workflowId: 'my-workflow',
        stage: 'chat',
        message: 'Hello',
        conversationId: 'conversation-123',
        params: {},
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toBe('/api/eai/v4/ai/chat/test-tenant/my-workflow/chat');
      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.message).toBe('Hello');
      expect(body.conversation_id).toBe('conversation-123');
      expect(body.params).toEqual({});
      expect(body.thread_id).toBeUndefined();
      expect(body.threadId).toBeUndefined();
    });

    it('passes v4 chat document-search and tool options through', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await chat.send({
        workflowId: 'my-workflow',
        stage: 'chat',
        message: 'Find policy documents',
        conversationId: 'conversation-123',
        params: {},
        document_scope: 'kb_only',
        tags: ['policy'],
        search_context: { jurisdiction: 'nsw' },
        tools: [{ type: 'function', function: { name: 'lookup' } }],
        tool_choice: 'auto',
      });

      const body = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(body.document_scope).toBe('kb_only');
      expect(body.tags).toEqual(['policy']);
      expect(body.search_context).toEqual({ jurisdiction: 'nsw' });
      expect(body.tools).toEqual([
        { type: 'function', function: { name: 'lookup' } },
      ]);
      expect(body.tool_choice).toBe('auto');
    });

    it('uses baseUrl (not streamBaseUrl)', async () => {
      mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

      await chat.send({
        workflowId: 'wf',
        stage: 's',
        message: 'test',
        params: {},
      });

      const url = mockFetch.mock.calls[0][0] as string;
      expect(url).toStartWith('/api/eai/');
      expect(url).not.toContain('/stream/');
    });
  });
});

// Custom matcher
expect.extend({
  toStartWith(received: string, expected: string) {
    const pass = received.startsWith(expected);
    return {
      pass,
      message: () => `expected "${received}" to start with "${expected}"`,
    };
  },
});

declare global {
  namespace jest {
    interface Matchers<R> {
      toStartWith(expected: string): R;
    }
  }
}
