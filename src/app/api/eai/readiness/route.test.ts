import { GET } from './route';
import { getGeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime';
import { objectTypes } from '@/eai.config/object-types';

jest.mock('@/lib/generated-workflow/runtime', () => ({
  getGeneratedWorkflowRuntime: jest.fn(),
}));

const READINESS_PROBE_TOKEN_ENV = ['EAI', 'READINESS', 'PROBE', 'TOKEN'].join(
  '_',
);
const TEST_TENANT_KEY = Object.keys(objectTypes)[0] ?? 'template';
const TEST_TENANT_ENV_KEY = TEST_TENANT_KEY.toUpperCase().replace(/-/g, '_');

describe('readiness route', () => {
  const mutableGlobal = global as {
    Response?: typeof Response;
  };
  const originalResponse = mutableGlobal.Response;
  const originalEnv = process.env;

  beforeEach(() => {
    mutableGlobal.Response = {
      json: (body: unknown, init?: ResponseInit) => ({
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
        json: async () => body,
      }),
    } as unknown as typeof Response;
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_NAME: 'contract-test',
      APP_BASE_PATH: '/contract-test',
      NEXT_PUBLIC_APP_BASE_PATH: '/contract-test',
      NEXT_PUBLIC_EAI_TENANT_ID: 'tenant-template',
      BASE_URL_PUBLIC_API: 'https://publicapi.example.test',
      ROUTING_BOOTSTRAP_PUBLIC_API_URL: 'https://publicapi.example.test',
      EAI_PRODUCT_SLUG: 'contract-test',
      EAI_ENVIRONMENT: 'dev',
      EAI_CONFIG_HASH: 'cfg-123',
      TENANT_KEYS: TEST_TENANT_KEY,
      [`TENANT_${TEST_TENANT_ENV_KEY}_ID`]: 'tenant-template',
      [`WORKFLOW_${TEST_TENANT_ENV_KEY}_ID`]: 'workflow-template',
      ENTRA_TENANT_NAME: 'example',
      ENTRA_TENANT_ID: 'entra-tenant',
      ENTRA_CLIENT_ID: 'entra-client',
      ENTRA_SCOPES: 'api://example/.default',
      ENTRA_CLIENT_SECRET: 'test-entra-secret',
      AUTH_URL: 'https://contract-test.example.test',
      AUTH_TRUST_HOST: 'true',
      AUTH_SECRET: 'test-auth-secret',
      [READINESS_PROBE_TOKEN_ENV]: 'probe-token',
    };
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'unconfigured',
    });
  });

  afterEach(() => {
    if (originalResponse) {
      mutableGlobal.Response = originalResponse;
    } else {
      delete mutableGlobal.Response;
    }
    process.env = originalEnv;
  });

  function readinessRequest(headers: Record<string, string> = {}): Request {
    return {
      headers: new Headers({
        'x-eai-readiness-probe': 'tenantinfra',
        'x-eai-tenant-id': 'tenant-template',
        'x-eai-app-key': 'contract-test',
        'x-eai-environment': 'dev',
        'x-eai-config-hash': 'cfg-123',
        authorization: 'Bearer probe-token',
        ...headers,
      }),
    } as Request;
  }

  it('returns readiness with no-store cache headers', async () => {
    const response = await GET(readinessRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    expect(body).toMatchObject({
      ok: true,
      service: 'contract-test',
      failureCategories: [],
    });
  });

  it('returns 503 with sanitized failure categories when readiness fails', async () => {
    delete process.env['AUTH_SECRET'];

    const response = await GET(readinessRequest());
    const body = await response.json();
    const serialized = JSON.stringify(body);

    expect(response.status).toBe(503);
    expect(body.failureCategories).toEqual(
      expect.arrayContaining(['auth_misconfigured', 'secret_missing']),
    );
    expect(serialized).toContain('AUTH_SECRET');
    expect(serialized).not.toContain('test-entra-secret');
    expect(serialized).not.toContain('test-auth-secret');
  });

  it('rejects requests that are not TenantInfra readiness probes', async () => {
    const response = await GET({ headers: new Headers() } as Request);
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.failureCategories).toEqual(['auth_misconfigured']);
    expect(body.checks).toEqual([
      { name: 'tenantinfra-probe', ok: false, category: 'auth_misconfigured' },
    ]);
  });

  it('rejects readiness probes with mismatched tenant scope', async () => {
    const response = await GET(
      readinessRequest({ 'x-eai-tenant-id': 'tenant-other' }),
    );
    const body = await response.json();

    expect(response.status).toBe(403);
    expect(body.failureCategories).toEqual(['tenant_assignment_invalid']);
  });

  it('rejects probes without the configured bearer token', async () => {
    const response = await GET(readinessRequest({ authorization: '' }));
    const body = await response.json();

    expect(response.status).toBe(401);
    expect(body.failureCategories).toEqual(['auth_misconfigured']);
  });

  it('rejects probes when the bearer token is not configured', async () => {
    delete process.env[READINESS_PROBE_TOKEN_ENV];

    const response = await GET(readinessRequest());
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.failureCategories).toEqual(['auth_misconfigured']);
  });

  it('accepts probes with the configured bearer token', async () => {
    const response = await GET(readinessRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failureCategories).toEqual([]);
  });

  it('accepts TenantInfra runtime env names for scope binding', async () => {
    delete process.env['NEXT_PUBLIC_EAI_TENANT_ID'];
    delete process.env['EAI_PRODUCT_SLUG'];
    process.env['EAI_TENANT_ID'] = 'tenant-template';
    process.env['EAI_APP_KEY'] = 'contract-test';

    const response = await GET(readinessRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.failureCategories).toEqual([]);
  });

  it('includes the bound workflow digest and title for TenantInfra promotion', async () => {
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'ready',
      runtime: {
        binding: {
          workflowTemplate: {
            digest: `sha256:${'a'.repeat(64)}`,
            title: 'Rates Review',
          },
        },
      },
    });

    const response = await GET(readinessRequest());
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.runtimeBinding).toEqual({
      workflowTemplate: {
        digest: `sha256:${'a'.repeat(64)}`,
        title: 'Rates Review',
      },
    });
  });
});
