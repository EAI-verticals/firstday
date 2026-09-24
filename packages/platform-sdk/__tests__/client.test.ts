import { EAIPlatformClient } from '../src/client';

const originalEnv = process.env;

describe('EAIPlatformClient', () => {
  afterEach(() => {
    process.env = originalEnv;
  });

  it('HP001 defaults API URLs to the Next.js app base path when configured', () => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_BASE_PATH: '/my-template/',
    };

    const client = new EAIPlatformClient({ tenantId: 'test-tenant' });

    expect(client.baseUrl).toBe('/my-template/api/eai');
    expect(client.streamBaseUrl).toBe('/my-template/api/eai/stream');
  });

  it('HP002 preserves explicitly provided API URLs', () => {
    const client = new EAIPlatformClient({
      tenantId: 'test-tenant',
      baseUrl: '/custom/api',
      streamBaseUrl: '/custom/stream',
    });

    expect(client.baseUrl).toBe('/custom/api');
    expect(client.streamBaseUrl).toBe('/custom/stream');
  });
});
