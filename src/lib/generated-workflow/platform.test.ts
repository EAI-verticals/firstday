import {
  __setGeneratedWorkflowTokenProviderForTests,
  generatedWorkflowPlatformFetch,
} from './platform';

describe('generated workflow runtime facade client', () => {
  const originalEnv = process.env;
  const originalFetch = global.fetch;

  beforeEach(() => {
    process.env = {
      ...originalEnv,
      EAI_PLATFORM_API_BASE_URL: 'https://publicapi.example.test',
      EAI_PLATFORM_TOKEN_AUDIENCE: 'api://generated-runtime',
    };
    global.fetch = jest.fn().mockResolvedValue({
      ok: true,
      status: 201,
      json: async () => ({ submissionId: 'submission-1' }),
    });
    __setGeneratedWorkflowTokenProviderForTests(async (audience) => {
      expect(audience).toBe('api://generated-runtime');
      return 'managed-identity-token';
    });
  });

  afterEach(() => {
    process.env = originalEnv;
    global.fetch = originalFetch;
    __setGeneratedWorkflowTokenProviderForTests(null);
  });

  it('keeps tenant, app, and managed identity on the server-side facade call', async () => {
    await generatedWorkflowPlatformFetch({
      tenantId: 'tenant a',
      appKey: 'rates-review',
      path: '/submissions',
      anonymousClientId: `sha256:${'a'.repeat(64)}`,
      init: {
        method: 'POST',
        body: JSON.stringify({ device: 'Desktop' }),
      },
    });

    expect(global.fetch).toHaveBeenCalledWith(
      'https://publicapi.example.test/v4/generated-app-runtime/tenants/tenant%20a/apps/rates-review/submissions',
      expect.objectContaining({
        method: 'POST',
        cache: 'no-store',
        headers: expect.any(Headers),
      }),
    );
    const headers = (global.fetch as jest.Mock).mock.calls[0][1]
      .headers as Headers;
    expect(headers.get('Authorization')).toBe('Bearer managed-identity-token');
    expect(headers.get('X-EAI-Anonymous-Client')).toBe(
      `sha256:${'a'.repeat(64)}`,
    );
    expect(headers.get('tenant')).toBeNull();
  });
});
