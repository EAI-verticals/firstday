import { GET } from './route';

describe('health route', () => {
  const mutableGlobal = global as {
    Response?: typeof Response;
  };
  const originalResponse = mutableGlobal.Response;

  beforeEach(() => {
    mutableGlobal.Response = {
      json: (body: unknown, init?: ResponseInit) => ({
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
        json: async () => body,
      }),
    } as unknown as typeof Response;
  });

  afterEach(() => {
    if (originalResponse) {
      mutableGlobal.Response = originalResponse;
    } else {
      delete mutableGlobal.Response;
    }
  });

  it('returns a host-neutral health response', async () => {
    const originalEnv = process.env;
    process.env = { ...originalEnv, NEXT_PUBLIC_APP_NAME: 'contract-test' };

    try {
      const response = await GET();
      const body = await response.json();

      expect(response.status).toBe(200);
      expect(response.headers.get('Cache-Control')).toContain('no-store');
      expect(body).toEqual({
        ok: true,
        service: 'contract-test',
      });
    } finally {
      process.env = originalEnv;
    }
  });
});
