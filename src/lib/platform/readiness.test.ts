import { evaluateRuntimeReadiness } from './readiness';
import { objectTypes } from '@/eai.config/object-types';

const TEST_TENANT_KEY = Object.keys(objectTypes)[0] ?? 'template';
const TEST_TENANT_ENV_KEY = TEST_TENANT_KEY.toUpperCase().replace(/-/g, '_');

function readyEnv(): NodeJS.ProcessEnv {
  return {
    NODE_ENV: 'test',
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
    EAI_READINESS_PROBE_TOKEN: 'probe-token',
  };
}

describe('runtime readiness contract', () => {
  it('returns ready when runtime config, secrets, tenant assignment, and object types are present', () => {
    const result = evaluateRuntimeReadiness(readyEnv());

    expect(result).toMatchObject({
      ok: true,
      service: 'contract-test',
      failureCategories: [],
    });
    expect(result.checks.every((check) => check.ok)).toBe(true);
  });

  it('accepts TenantInfra runtime env names for tenant and app scope', () => {
    const env = readyEnv();
    delete env.NEXT_PUBLIC_EAI_TENANT_ID;
    delete env.EAI_PRODUCT_SLUG;
    env.EAI_TENANT_ID = 'tenant-template';
    env.EAI_APP_KEY = 'contract-test';

    const result = evaluateRuntimeReadiness(env);

    expect(result.ok).toBe(true);
    expect(result.failureCategories).toEqual([]);
  });

  it('reports sanitized failure categories without returning secret values', () => {
    const env = readyEnv();
    delete env.AUTH_SECRET;
    env.BASE_URL_PUBLIC_API = 'not-a-url';

    const result = evaluateRuntimeReadiness(env);
    const serialized = JSON.stringify(result);

    expect(result.ok).toBe(false);
    expect(result.failureCategories).toEqual(
      expect.arrayContaining([
        'auth_misconfigured',
        'publicapi_unreachable',
        'secret_missing',
      ]),
    );
    expect(serialized).toContain('AUTH_SECRET');
    expect(serialized).not.toContain('test-entra-secret');
    expect(serialized).not.toContain('test-auth-secret');
  });
});
