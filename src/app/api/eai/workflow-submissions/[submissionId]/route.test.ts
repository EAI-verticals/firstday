import { ReadableStream } from 'node:stream/web';
import { TextEncoder } from 'node:util';

const mockPlatformFetch = jest.fn();
const mockGetRuntime = jest.fn();
const mockReadOwnedSubmission = jest.fn();

jest.mock('next/server', () => ({
  NextResponse: class MockNextResponse {
    readonly body: unknown;
    readonly headers: Headers;
    readonly status: number;

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

jest.mock('@/lib/generated-workflow/submission-store', () => ({
  readOwnedSubmission: (...args: unknown[]) => mockReadOwnedSubmission(...args),
}));

import { PATCH } from './route';

function oversizedChunkedPatch(): Request {
  const encoder = new TextEncoder();
  const chunks = [
    encoder.encode('{"formData":{"answer":"'),
    encoder.encode('x'.repeat(256 * 1024)),
    encoder.encode('"}}'),
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
  return {
    headers: new Headers({
      'content-type': 'application/json',
      'content-length': '32',
    }),
    body,
  } as unknown as Request;
}

describe('generated workflow anonymous submission update BFF', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetRuntime.mockReturnValue({
      status: 'ready',
      runtime: {
        appKey: 'rates-review',
        tenantId: 'tenant-a',
      },
    });
  });

  it('rejects a false-small chunked JSON body before ownership or platform access', async () => {
    const response = await PATCH(oversizedChunkedPatch() as never, {
      params: Promise.resolve({ submissionId: 'submission-1' }),
    });

    expect(response.status).toBe(413);
    await expect(response.json()).resolves.toEqual({
      error: 'PAYLOAD_TOO_LARGE',
    });
    expect(mockReadOwnedSubmission).not.toHaveBeenCalled();
    expect(mockPlatformFetch).not.toHaveBeenCalled();
  });
});
