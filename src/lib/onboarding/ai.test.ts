/** @jest-environment node */
// Contract tests with mocked SDK replies. These do not verify live AI access,
// entitlement, workflow configuration, or model quality.
import {
  askAi,
  askKnowledgeBase,
  draftAi,
  reviewAi,
  type AiRuntime,
} from './ai';
import { EMPTY_EMPLOYEE, HR_FALLBACK, type KnowledgeDocument } from './core';
const mockSend = jest.fn();
const mockStream = jest.fn();
jest.mock('@enterpriseaigroup/platform-sdk', () => ({
  EAIPlatformClient: jest.fn().mockImplementation(() => ({
    chat: {
      send: (...args: unknown[]) => mockSend(...args),
      stream: (...args: unknown[]) => mockStream(...args),
    },
  })),
}));
const runtime: AiRuntime = {
  configured: true,
  tenantId: 'tenant-123',
  workflowId: 'onboarding',
  appKey: 'test-onboarding-app',
  stages: { answer: 'answer', generate: 'generate', review: 'review' },
};
const policy: KnowledgeDocument = {
  id: 'real-handbook',
  title: 'Company handbook',
  category: 'Handbook',
  sample: false,
  text: 'PTO: Employees receive 25 days annually. Request leave from your manager.',
};
const labels = [
  'Employee signature',
  'Hire date',
  'Manager approval',
  'Emergency contact',
  'Tax forms completed',
  'Background check cleared',
  'Equipment inventory signed',
];
const keys = [
  'signature',
  'hire',
  'approval',
  'emergency',
  'tax',
  'background',
  'equipment',
];
const values = [
  'Jane Smith',
  '2026-10-01',
  'Jamie Chen',
  'Alex Smith +61 412 345 678',
  'Completed',
  'Cleared',
  'Signed',
];
const lines = labels.map((label, i) => `${label}: ${values[i]}`);
const fields = () =>
  keys.map((key, i) => ({
    key,
    value: values[i],
    evidence: lines[i],
    complete: true,
  }));
function reply(value: unknown, envelope = 'response') {
  mockSend.mockResolvedValueOnce({
    ok: true,
    text: async () =>
      JSON.stringify(envelope ? { [envelope]: JSON.stringify(value) } : value),
  });
}
beforeEach(() => {
  mockSend.mockReset();
  mockStream.mockReset();
});

describe('Admin Portal driven streaming chat', () => {
  it('delivers real tokens before the stream completes', async () => {
    let controller!: ReadableStreamDefaultController<Uint8Array>;
    mockStream.mockResolvedValueOnce(
      new ReadableStream<Uint8Array>({
        start(value) {
          controller = value;
        },
      }),
    );
    let nextChunk!: (text: string) => void;
    let received = new Promise<string>((resolve) => {
      nextChunk = resolve;
    });
    let finished = false;
    const answer = askKnowledgeBase('Help me prepare.', runtime, (text) =>
      nextChunk(text),
    );
    void answer.then(() => {
      finished = true;
    });
    const push = (event: unknown): void =>
      controller.enqueue(
        new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`),
      );
    push({ type: 'token', data: 'Hello' });
    expect(await received).toBe('Hello');
    expect(finished).toBe(false);
    received = new Promise<string>((resolve) => {
      nextChunk = resolve;
    });
    push({ type: 'token', data: ' there.' });
    expect(await received).toBe('Hello there.');
    expect(finished).toBe(false);
    push({ type: 'done', data: { done: true, finish_reason: 'stop' } });
    await expect(answer).resolves.toEqual({ text: 'Hello there.' });
    expect(mockSend).not.toHaveBeenCalled();
  });

  function streamEvents(events: unknown[], split = false) {
    const raw = events
      .map((event) => `data: ${JSON.stringify(event)}\r\n\r\n`)
      .join('');
    mockStream.mockResolvedValueOnce(
      new ReadableStream<Uint8Array>({
        start(controller) {
          const data = new TextEncoder().encode(raw);
          if (split)
            for (const byte of data) controller.enqueue(Uint8Array.of(byte));
          else controller.enqueue(data);
          controller.close();
        },
      }),
    );
  }
  it('streams v4 replies without prompt or model overrides, handling split UTF-8 frames', async () => {
    streamEvents(
      [
        { type: 'start', data: { context_metadata: { chunks_retrieved: 1 } } },
        { type: 'token', data: 'Hello café [Handbook.pdf]' },
        {
          type: 'done',
          data: {
            done: true,
            finish_reason: 'stop',
            citations: [{ name: 'Handbook', marker: '[Handbook.pdf]' }],
          },
        },
      ],
      true,
    );
    const update = jest.fn();
    expect(await askKnowledgeBase('Help me prepare.', runtime, update)).toEqual(
      {
        text: 'Hello café',
        citations: [{ name: 'Handbook' }],
      },
    );
    expect(update).toHaveBeenLastCalledWith('Hello café [Handbook.pdf]');
    expect(mockSend).not.toHaveBeenCalled();
    expect(mockStream.mock.calls[0][0]).not.toHaveProperty('runtime_context');
    expect(mockStream.mock.calls[0][0]).not.toHaveProperty('ai_config');
    expect(mockStream).toHaveBeenCalledWith(
      expect.objectContaining({
        integrations: [],
        document_scope: 'kb_only',
        use_context_enrichment: true,
        include_citations: true,
      }),
    );
  });
  it.each([
    [
      { type: 'token', data: 'Incomplete' },
      { type: 'error', data: { error: 'AttributeError' } },
    ],
    [{ type: 'token', data: 'Incomplete' }],
  ])(
    'discards incomplete streams and recovers once through non-stream chat',
    async (...events) => {
      streamEvents(events);
      reply({ success: true, message: HR_FALLBACK, finish_reason: 'stop' }, '');
      const update = jest.fn();
      expect(await askKnowledgeBase('Hello', runtime, update)).toEqual({
        text: HR_FALLBACK,
      });
      expect(update).toHaveBeenLastCalledWith('');
      expect(mockSend).toHaveBeenCalledTimes(1);
      expect(mockSend.mock.calls[0][0].conversationId).not.toBe(
        mockStream.mock.calls[0][0].conversationId,
      );
    },
  );
  it('does not retry denied access', async () => {
    mockStream.mockRejectedValueOnce({ status: 403 });
    await expect(askKnowledgeBase('Hello', runtime)).rejects.toThrow('access');
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('rejects an unsuccessful fallback and keeps history bounded and redacted', async () => {
    mockStream.mockRejectedValueOnce(new Error('Broken stream'));
    reply({ success: false, message: 'Incomplete' }, '');
    await expect(
      askKnowledgeBase(
        'Hello',
        runtime,
        undefined,
        Array.from({ length: 8 }, () => ({
          role: 'user' as const,
          text: 'Password: do-not-send',
        })),
      ),
    ).rejects.toThrow('unavailable');
    expect(mockStream.mock.calls[0][0].message_history).toHaveLength(6);
    expect(JSON.stringify(mockStream.mock.calls[0][0])).not.toContain(
      'do-not-send',
    );
  });
});

describe('company knowledge base chat', () => {
  const marker = '[Employee_Handbook.pdf#page=2]';
  const grounded = {
    success: true,
    message: `Ask your manager to approve your leave. ${marker}`,
    context_metadata: { chunks_retrieved: 1 },
    citations: [{ marker, name: 'Employee_Handbook.pdf', page: 2 }],
  };
  it('allows general guidance governed by the Admin Portal prompt without invented citations', async () => {
    reply(
      {
        success: true,
        message:
          'Start by entering your basic details, then upload your documents.',
        context_metadata: { chunks_retrieved: 0 },
        citations: [],
      },
      '',
    );
    expect(
      await askKnowledgeBase('How does onboarding work?', runtime),
    ).toEqual({
      text: 'Start by entering your basic details, then upload your documents.',
    });
  });
  it('retrieves only company knowledge and preserves resolved citations', async () => {
    reply(grounded, '');
    expect(await askKnowledgeBase('How do I request leave?', runtime)).toEqual({
      text: 'Ask your manager to approve your leave.',
      citations: [{ name: 'Employee_Handbook.pdf', page: 2 }],
    });
    expect(mockSend).toHaveBeenCalledWith(
      expect.objectContaining({
        message: 'How do I request leave?',
        vertical_key: 'test-onboarding-app',
        document_scope: 'kb_only',
        use_context_enrichment: true,
        include_citations: true,
      }),
    );
  });
  it('keeps EAI document links and rejects unsafe citation URLs', async () => {
    const url =
      'https://documents.example.com/handbook.pdf?signature=test#page=2';
    reply({ ...grounded, citations: [{ ...grounded.citations[0], url }] }, '');
    expect((await askKnowledgeBase('Leave?', runtime)).citations?.[0].url).toBe(
      url,
    );
    for (const unsafe of [
      'javascript:alert(1)',
      'data:text/html,test',
      'http://example.com/file.pdf',
      'https://user:password@example.com/file.pdf',
    ]) {
      reply(
        { ...grounded, citations: [{ ...grounded.citations[0], url: unsafe }] },
        '',
      );
      expect(
        (await askKnowledgeBase('Leave?', runtime)).citations?.[0].url,
      ).toBeUndefined();
    }
  });
  it.each([
    { ...grounded, context_metadata: { chunks_retrieved: 0 } },
    { ...grounded, citations: [] },
    {
      ...grounded,
      citations: [{ marker: '[Invented.pdf]', name: 'Invented.pdf' }],
    },
    { ...grounded, message: `${grounded.message} Extra claim [Invented.pdf]` },
  ])(
    'abstains when retrieval or citation evidence is missing',
    async (result) => {
      reply(result, '');
      expect(await askKnowledgeBase('Leave?', runtime)).toEqual({
        text: HR_FALLBACK,
      });
    },
  );
  it('preserves the exact HR fallback and surfaces service failure', async () => {
    reply({ success: true, message: HR_FALLBACK }, '');
    expect(await askKnowledgeBase('Unknown policy?', runtime)).toEqual({
      text: HR_FALLBACK,
    });
    mockSend.mockRejectedValueOnce({ status: 502 });
    await expect(askKnowledgeBase('Leave?', runtime)).rejects.toThrow(
      'unavailable',
    );
  });
});

describe('AI adapter contract (mocked service)', () => {
  it('requires runtime configuration and rejects unsafe path values without a request', async () => {
    await expect(
      askAi('PTO?', [policy], {
        ...runtime,
        configured: false,
        reason: 'Subscription is inactive.',
      }),
    ).rejects.toThrow('Subscription');
    await expect(
      draftAi('welcome', EMPTY_EMPLOYEE, [], {
        ...runtime,
        workflowId: '../bad',
      }),
    ).rejects.toThrow('configuration');
    expect(mockSend).not.toHaveBeenCalled();
  });
  it('returns a cited AI answer only with an actual verbatim quote and supported envelope', async () => {
    reply({
      answer: 'You receive 25 days each year. Request leave from your manager.',
      sourceId: policy.id,
      quote: policy.text,
    });
    expect(await askAi('What is the PTO policy?', [policy], runtime)).toEqual({
      text: 'You receive 25 days each year. Request leave from your manager.',
      source: policy,
      excerpt: policy.text,
    });
    expect(mockSend.mock.calls[0][0]).toMatchObject({
      workflowId: 'onboarding',
      stage: 'answer',
      params: {},
      vertical_key: 'test-onboarding-app',
      use_context_enrichment: false,
    });
    expect(mockSend.mock.calls[0][0].message).toContain('UNTRUSTED_INPUT_JSON');
  });
  it('abstains for missing documents, unknown answers and fabricated citations', async () => {
    expect(await askAi('PTO?', [], runtime)).toEqual({ text: HR_FALLBACK });
    expect(mockSend).not.toHaveBeenCalled();
    for (const result of [
      { answer: HR_FALLBACK },
      { answer: '60 days', sourceId: 'invented', quote: policy.text },
      { answer: '60 days', sourceId: policy.id, quote: '60 days' },
    ]) {
      reply(result, 'message');
      expect(await askAi('PTO?', [policy], runtime)).toEqual({
        text: HR_FALLBACK,
      });
    }
  });
  it('bounds user input and sends limited source snippets without credential assignment lines', async () => {
    await expect(askAi('a'.repeat(1001), [policy], runtime)).rejects.toThrow(
      '1,000',
    );
    reply({ answer: HR_FALLBACK });
    await askAi(
      'PTO?',
      [
        {
          ...policy,
          text: `${policy.text}\n\nPassword: do-not-send\nThe password is also-do-not-send\n\n${'long source '.repeat(10000)}`,
        },
      ],
      runtime,
    );
    const message = mockSend.mock.calls[0][0].message;
    expect(message).not.toContain('do-not-send');
    expect(message).not.toContain('also-do-not-send');
    expect(message.length).toBeLessThan(30000);
  });
  it('drafts structured text without sending temporary passwords or logins', async () => {
    reply(
      {
        title: 'Welcome Jane',
        sections: [
          {
            heading: 'Your first day',
            body: 'Meet Jamie to discuss your new role.',
          },
        ],
      },
      '',
    );
    const result = await draftAi(
      'welcome',
      {
        ...EMPTY_EMPLOYEE,
        name: 'Jane',
        temporaryPassword: 'SECRET!not-sent',
        login: 'private-login',
      },
      [policy],
      runtime,
    );
    expect(result.sections).toHaveLength(1);
    expect(mockSend.mock.calls[0][0].message).not.toContain('SECRET!not-sent');
    expect(mockSend.mock.calls[0][0].message).not.toContain('private-login');
  });
  it('rejects invented credential assignments and limits deposit output to blank headings', async () => {
    reply({
      title: 'IT',
      sections: [{ heading: 'Account', body: 'Password: invented123' }],
    });
    await expect(draftAi('it', EMPTY_EMPLOYEE, [], runtime)).rejects.toThrow(
      'credentials',
    );
    reply({
      title: 'Payroll',
      sections: [{ heading: 'Bank details', body: '' }],
    });
    expect(
      (
        await draftAi(
          'deposit',
          { ...EMPTY_EMPLOYEE, name: 'Private Person' },
          [policy],
          runtime,
        )
      ).title,
    ).toBe('Direct deposit form');
    expect(mockSend.mock.calls[1][0].message).not.toContain('Private Person');
    expect(mockSend.mock.calls[1][0].message).not.toContain(policy.text);
    reply({
      title: 'Payroll',
      sections: [{ heading: 'Account number 123456', body: '' }],
    });
    await expect(
      draftAi('deposit', EMPTY_EMPLOYEE, [], runtime),
    ).rejects.toThrow('filled payroll');
  });
  it('passes only all seven complete, source-grounded values that pass deterministic checks', async () => {
    reply({ fields: fields() });
    const checked = await reviewAi(lines.join('\n'), 'completed.txt', runtime);
    expect(checked.passed).toBe(true);
    expect(checked.text).toBe(lines.join('\n'));
    expect(checked.items).toHaveLength(7);
    expect(checked.items[0].evidence).toBe(lines[0]);
  });
  it('rejects missing keys and duplicate fields', async () => {
    reply({ fields: fields().slice(1) });
    await expect(
      reviewAi(lines.join('\n'), 'partial.txt', runtime),
    ).rejects.toThrow('omitted');
    const duplicates = fields();
    duplicates[6] = duplicates[0];
    reply({ fields: duplicates });
    await expect(
      reviewAi(lines.join('\n'), 'duplicate.txt', runtime),
    ).rejects.toThrow('duplicate');
  });
  it('fails invented evidence, uncertainty and invalid normalized values', async () => {
    for (const change of [
      { evidence: 'invented quote' },
      { complete: false },
      { value: '2026-02-30', evidence: 'Hire date: 2026-02-30' },
    ]) {
      const result = fields();
      result[1] = { ...result[1], ...change };
      reply({ fields: result });
      expect(
        (await reviewAi(lines.join('\n'), 'check.txt', runtime)).passed,
      ).toBe(false);
    }
  });
  it('never overrides explicit original negatives or empty fields with AI extraction', async () => {
    for (const value of ['Not cleared', '']) {
      const text = `${lines.map((line) => (line.startsWith('Background check') ? `Background check cleared: ${value}` : line)).join('\n')}\nEarlier result: Cleared`;
      const result = fields();
      result[5].evidence = 'Earlier result: Cleared';
      reply({ fields: result });
      expect((await reviewAi(text, 'conflict.txt', runtime)).passed).toBe(
        false,
      );
    }
  });
  it('fails conflicting prose even when the model selects earlier positive evidence', async () => {
    reply({ fields: fields() });
    const checked = await reviewAi(
      `${lines.join('\n')}\nThe background check is pending a second review.`,
      'contradiction.txt',
      runtime,
    );
    expect(checked.passed).toBe(false);
  });
  it.each([
    [401, 'Sign in'],
    [403, 'does not have access'],
    [503, 'AI service is not available'],
    [500, 'unavailable'],
  ])('sanitizes SDK rejection status %s', async (status, message) => {
    mockSend.mockRejectedValueOnce(
      Object.assign(new Error('backend trace with secret'), { status }),
    );
    await expect(askAi('PTO?', [policy], runtime)).rejects.toThrow(
      message as string,
    );
  });
  it('fails closed on unknown server envelopes', async () => {
    reply({ data: { result: { answer: 'Unverified result' } } }, '');
    await expect(askAi('PTO?', [policy], runtime)).rejects.toThrow(
      'unsupported response format',
    );
  });
  it('rejects malformed transport output and oversized review input', async () => {
    mockSend.mockResolvedValueOnce({ ok: true, text: async () => 'not JSON' });
    await expect(askAi('PTO?', [policy], runtime)).rejects.toThrow(
      'unreadable',
    );
    await expect(
      reviewAi('x'.repeat(24001), 'huge.txt', runtime),
    ).rejects.toThrow('24,000');
  });
});
