import { generatedWorkflowServerConfigurationErrors } from './server-configuration';

describe('generated workflow conditional server configuration', () => {
  it('accepts the ACA managed-identity and anonymous-session runtime settings', () => {
    expect(
      generatedWorkflowServerConfigurationErrors({
        NODE_ENV: 'test',
        EAI_PLATFORM_API_BASE_URL: 'https://publicapi.example.test',
        EAI_PLATFORM_TOKEN_AUDIENCE: 'api://generated-runtime',
        AZURE_CLIENT_ID: 'uami-client-id',
        IDENTITY_ENDPOINT: 'http://localhost:42356/msi/token',
        IDENTITY_HEADER: 'aca-injected-header',
        EAI_GENERATED_WORKFLOW_SESSION_SECRET: 's'.repeat(48),
      }),
    ).toEqual([]);
  });

  it('reports names only for missing or invalid server settings', () => {
    const errors = generatedWorkflowServerConfigurationErrors({
      NODE_ENV: 'test',
      EAI_PLATFORM_API_BASE_URL: 'not-a-url',
      EAI_GENERATED_WORKFLOW_SESSION_SECRET: 'short',
    });

    expect(errors).toEqual(
      expect.arrayContaining([
        'AZURE_CLIENT_ID',
        'EAI_PLATFORM_API_BASE_URL|BASE_URL_PUBLIC_API',
        'EAI_PLATFORM_TOKEN_AUDIENCE',
        'EAI_GENERATED_WORKFLOW_SESSION_SECRET',
        'IDENTITY_ENDPOINT',
        'IDENTITY_HEADER',
      ]),
    );
    expect(JSON.stringify(errors)).not.toContain('short');
  });
});
