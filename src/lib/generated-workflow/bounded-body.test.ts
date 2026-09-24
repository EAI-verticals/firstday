import {
  readBoundedRequestBody,
  RequestBodyTooLargeError,
} from './bounded-body';

function requestWithBody(chunks: Uint8Array[], headers?: HeadersInit): Request {
  const stream = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((chunk) => controller.enqueue(chunk));
      controller.close();
    },
  });
  return {
    body: stream,
    headers: {
      get(name: string) {
        const match = Object.entries(headers ?? {}).find(
          ([key]) => key.toLowerCase() === name.toLowerCase(),
        );
        return match ? String(match[1]) : null;
      },
    },
  } as Request;
}

describe('readBoundedRequestBody', () => {
  it('rejects an oversized body when Content-Length is missing', async () => {
    const request = requestWithBody([new Uint8Array(6), new Uint8Array(6)]);

    await expect(readBoundedRequestBody(request, 10)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it('rejects an oversized body when Content-Length is falsely small', async () => {
    const request = requestWithBody([new Uint8Array(11)], {
      'content-length': '1',
    });

    await expect(readBoundedRequestBody(request, 10)).rejects.toBeInstanceOf(
      RequestBodyTooLargeError,
    );
  });

  it('accepts a bounded chunked body', async () => {
    const body = await readBoundedRequestBody(
      requestWithBody([new Uint8Array([1, 2]), new Uint8Array([3, 4])], {
        'transfer-encoding': 'chunked',
      }),
      4,
    );

    expect(Array.from(body)).toEqual([1, 2, 3, 4]);
  });
});
