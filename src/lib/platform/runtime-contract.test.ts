import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

import { APPROVED_SCHEMA_PROVENANCE } from './schema-provenance';
import { validateSecretRefDeclarations } from '../../eai.config/deployment-contract';

describe('eai.runtime.json', () => {
  it('declares the provider-neutral runtime contract expected by the CLI', async () => {
    const contract = JSON.parse(
      await readFile(join(process.cwd(), 'eai.runtime.json'), 'utf8'),
    );

    expect(contract.schemaVersion).toBe(1);
    expect(contract.capabilities).toMatchObject({
      authjsEntraSignIn: true,
      publicApiBffAccess: true,
      tenantWorkflowConfiguration: true,
      serviceIdentity: false,
      publicAnonymousEndpointsRequireServerPlatformAccess: false,
    });
    expect(contract.environment.required).toEqual(
      expect.arrayContaining([
        'BASE_URL_PUBLIC_API',
        'TENANT_KEYS',
        'ENTRA_CLIENT_ID',
        'AUTH_URL',
        'EAI_ENVIRONMENT',
        'EAI_CONFIG_HASH',
      ]),
    );
    expect(contract.secrets.required).toEqual(
      expect.arrayContaining(['AUTH_SECRET', 'ENTRA_CLIENT_SECRET']),
    );
    expect(contract.secrets.required).toEqual(
      expect.arrayContaining(['EAI_READINESS_PROBE_TOKEN']),
    );
    expect(contract.secrets.optional).not.toEqual(
      expect.arrayContaining(['EAI_READINESS_PROBE_TOKEN']),
    );
    expect(contract.secrets.optional).not.toEqual(
      expect.arrayContaining(['EAI_SERVICE_CLIENT_SECRET', 'OBO_CLIENT_SECRET']),
    );
    expect(contract.secrets.declarations.required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'AUTH_SECRET',
          required: true,
          secretRef: {
            kind: 'tenant-infra-envelope',
            name: 'AUTH_SECRET',
          },
        }),
        expect.objectContaining({
          name: 'EAI_READINESS_PROBE_TOKEN',
          required: true,
          secretRef: {
            kind: 'tenant-infra-envelope',
            name: 'EAI_READINESS_PROBE_TOKEN',
          },
        }),
        expect.objectContaining({
          name: 'ENTRA_CLIENT_SECRET',
          required: true,
          secretRef: {
            kind: 'tenant-infra-envelope',
            name: 'ENTRA_CLIENT_SECRET',
          },
        }),
      ]),
    );
    expect(contract.secrets.declarations.optional).not.toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'EAI_READINESS_PROBE_TOKEN' }),
        expect.objectContaining({ name: 'EAI_SERVICE_CLIENT_SECRET' }),
        expect.objectContaining({ name: 'OBO_CLIENT_SECRET' }),
      ]),
    );
    expect(
      validateSecretRefDeclarations(
        contract.secrets.declarations,
        'secrets.declarations',
      ),
    ).toEqual({
      valid: true,
      errors: [],
    });
    expect(contract.endpoints).toMatchObject({
      health: '/health',
      readiness: '/api/eai/readiness',
      authProviders: '/api/auth/providers',
      runtimeConfig: '/api/eai/config',
      bffBasePath: '/api/eai',
    });
    expect(contract.serviceIdentity).toBeUndefined();
    expect(contract.schemaProvenance).toEqual(APPROVED_SCHEMA_PROVENANCE);
    expect(contract.endpoints.smokeTests).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'readiness',
          expectedStatus: 200,
          headers: expect.objectContaining({
            'x-eai-readiness-probe': 'tenantinfra',
            authorization: 'Bearer ${EAI_READINESS_PROBE_TOKEN}',
          }),
          requiresSecret: 'EAI_READINESS_PROBE_TOKEN',
        }),
      ]),
    );
  });
});
