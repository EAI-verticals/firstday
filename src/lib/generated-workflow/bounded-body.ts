import { TextDecoder } from 'node:util';

/** Signals that a streamed request crossed its absolute byte limit. */
export class RequestBodyTooLargeError extends Error {
  constructor() {
    super('Request body exceeds the configured limit.');
    this.name = 'RequestBodyTooLargeError';
  }
}

/** Maximum accepted JSON bytes on anonymous generated-workflow mutations. */
export const MAX_ANONYMOUS_JSON_BODY_BYTES = 256 * 1024;

/** Reads a request stream up to an absolute byte limit and aborts on overflow. */
export async function readBoundedRequestBody(
  request: Request,
  maxBytes: number,
): Promise<Uint8Array> {
  const contentLength = request.headers.get('content-length');
  if (
    contentLength &&
    /^\d+$/.test(contentLength) &&
    Number(contentLength) > maxBytes
  ) {
    throw new RequestBodyTooLargeError();
  }
  if (!request.body) return new Uint8Array();
  const reader = request.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      total += value.byteLength;
      if (total > maxBytes) {
        await reader.cancel();
        throw new RequestBodyTooLargeError();
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const body = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    body.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return body;
}

/** Parses JSON only after the request stream has satisfied its byte limit. */
export async function readBoundedJsonBody(
  request: Request,
  maxBytes = MAX_ANONYMOUS_JSON_BODY_BYTES,
): Promise<unknown> {
  const bytes = await readBoundedRequestBody(request, maxBytes);
  return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
}
