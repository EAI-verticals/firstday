import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';

const mockPlatformFetch = jest.fn();
const mockGetRuntime = jest.fn();
const mockSetSubmissionSession = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    readonly body: unknown;
    readonly headers: Headers;
    readonly status: number;
    readonly cookies = { set: jest.fn() };

    constructor(body: unknown, init?: ResponseInit) {
      this.body = body;
      this.headers = new Headers(init?.headers);
      this.status = init?.status ?? 200;
    }

    static json(body: unknown, init?: ResponseInit) {
      return new MockNextResponse(body, init);
    }

    async json() {
      return this.body;
    }
  },
}));

jest.mock('@/lib/generated-workflow/platform', () => ({
  generatedWorkflowPlatformFetch: (...args: unknown[]) =>
    mockPlatformFetch(...args),
}));

jest.mock('@/lib/generated-workflow/runtime', () => ({
  getGeneratedWorkflowRuntime: () => mockGetRuntime(),
}));

jest.mock('@/lib/generated-workflow/submission-session', () => ({
  setSubmissionSession: (...args: unknown[]) =>
    mockSetSubmissionSession(...args),
}));

import { POST } from './route';

function jsonRequest(value: unknown): Request {
  const encoded = new TextEncoder().encode(JSON.stringify(value));
  return {
    headers: new Headers({ 'content-type': 'application/json' }),
    body: new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(encoded);
        controller.close();
      },
    }),
  } as unknown as Request;
}

function oversizedChunkedRequest(declaredLength?: string): Request {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('{"device":"'),
    encoder.encode('x'.repeat(256 * 1024)),
    encoder.encode('"}'),
  ];
  let index = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (index < chunks.length) {
        controller.enqueue(chunks[index]);
        index += 1;
      } else {
        controller.close();
      }
    },
  });
  const headers = new Headers({ 'content-type': 'application/json' });
  if (declaredLength) headers.set('content-length', declaredLength);
  return {
    headers,
    body,
  } as unknown as Request;
}

describe('generated workflow anonymous submission BFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRuntime.mockReturnValue({
      status: 'ready',
      runtime: {
        appKey: 'rates-review',
        tenantId: 'tenant-a',
        binding: {
          workflowTemplate: {
            id: 'template-123',
            version: 4,
            digest: `sha256:${'a'.repeat(64)}`,
          },
          respondentAccess: {
            submissionObjectType: 'workflow-submission',
          },
        },
      },
    });
    mockPlatformFetch.mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ submissionId: 'submission-1' }),
    });
  });

  it('calls only the managed-identity facade and issues browser ownership state', async () => {
    const request = jsonRequest({ device: 'Desktop' });
    request.headers.set('x-forwarded-for', '192.0.2.1');
    const response = await POST(request as never);

    expect(response.status).toBe(201);
    await expect(response.json()).resolves.toEqual({
      submissionId: 'submission-1',
    });
    expect(mockPlatformFetch).toHaveBeenCalledWith({
      tenantId: 'tenant-a',
      appKey: 'rates-review',
      path: '/submissions',
      anonymousClientId: expect.stringMatching(/^sha256:[a-f0-9]{64}$/),
      init: {
        method: 'POST',
        body: expect.any(String),
      },
    });
    const requestBody = JSON.parse(
      mockPlatformFetch.mock.calls[0][0].init.body,
    );
    expect(requestBody).toMatchObject({
      workflowTemplate: {
        id: 'template-123',
        version: 4,
        digest: `sha256:${'a'.repeat(64)}`,
      },
      device: 'Desktop',
    });
    expect(JSON.stringify(requestBody)).not.toContain('token');
    expect(mockSetSubmissionSession).toHaveBeenCalledWith(
      response,
      'submission-1',
      `sha256:${'a'.repeat(64)}`,
      request,
    );
  });

  it('rejects malformed device values before calling PublicAPI', async () => {
    const response = await POST(jsonRequest({ device: 'Watch' }) as never);

    expect(response.status).toBe(400);
    expect(mockPlatformFetch).not.toHaveBeenCalled();
  });

  it.each([
    ['without Content-Length', undefined],
    ['with a false-small Content-Length', '1'],
  ])(
    'rejects a chunked oversized anonymous JSON body %s',
    async (_description, declaredLength) => {
      const response = await POST(
        oversizedChunkedRequest(declaredLength) as never,
      );

      expect(response.status).toBe(413);
      await expect(response.json()).resolves.toEqual({
        error: 'PAYLOAD_TOO_LARGE',
      });
      expect(mockPlatformFetch).not.toHaveBeenCalled();
    },
  );
});
