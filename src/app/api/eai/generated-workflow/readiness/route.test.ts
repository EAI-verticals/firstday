import { getGeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime';
import { generatedWorkflowServerConfigurationErrors } from '@/lib/generated-workflow/server-configuration';
import { generatedWorkflowPlatformFetch } from '@/lib/generated-workflow/platform';
import { GET } from './route';

jest.mock('@/lib/generated-workflow/runtime', () => ({
  getGeneratedWorkflowRuntime: jest.fn(),
}));
jest.mock('@/lib/generated-workflow/server-configuration', () => ({
  generatedWorkflowServerConfigurationErrors: jest.fn(),
}));
jest.mock('@/lib/generated-workflow/platform', () => ({
  generatedWorkflowPlatformFetch: jest.fn(),
}));

describe('generated workflow semantic readiness', () => {
  const mutableGlobal = global as { Response?: typeof Response };
  const originalResponse = mutableGlobal.Response;

  beforeEach(() => {
    mutableGlobal.Response = {
      json: (body: unknown, init?: ResponseInit) => ({
        status: init?.status ?? 200,
        headers: new Headers(init?.headers),
        json: async () => body,
      }),
    } as unknown as typeof Response;
    jest.clearAllMocks();
    (generatedWorkflowServerConfigurationErrors as jest.Mock).mockReturnValue(
      [],
    );
    (generatedWorkflowPlatformFetch as jest.Mock).mockResolvedValue({
      ok: true,
      json: async () => ({
        runtimeBinding: {
          schemaVersion: 'eai.generated_app_runtime_binding.v1',
          workflowTemplate: {
            id: 'template-123',
            version: 1,
            digest: `sha256:${'a'.repeat(64)}`,
            title: 'Rates Review',
          },
          respondentAccess: {
            mode: 'anonymous',
            submissionObjectType: 'workflow-submission',
            fileObjectType: 'submission-file',
          },
        },
      }),
    });
  });

  afterEach(() => {
    if (originalResponse) {
      mutableGlobal.Response = originalResponse;
    } else {
      delete mutableGlobal.Response;
    }
  });

  it('returns the immutable digest and title when the imported snapshot matches', async () => {
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'ready',
      runtime: {
        binding: {
          workflowTemplate: {
            id: 'template-123',
            version: 1,
            digest: `sha256:${'a'.repeat(64)}`,
            title: 'Rates Review',
          },
        },
      },
    });

    const response = await GET();

    expect(response.status).toBe(200);
    expect(response.headers.get('Cache-Control')).toContain('no-store');
    await expect(response.json()).resolves.toEqual({
      status: 'ready',
      workflowTemplate: {
        digest: `sha256:${'a'.repeat(64)}`,
        title: 'Rates Review',
      },
    });
  });

  it('fails closed without exposing validation details', async () => {
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'invalid',
      errors: ['tenantId is missing.'],
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      error: 'WORKFLOW_SNAPSHOT_INVALID',
    });
  });

  it('fails closed when the conditional BFF runtime settings are missing', async () => {
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'ready',
      runtime: {
        binding: {
          workflowTemplate: {
            id: 'template-123',
            version: 1,
            digest: `sha256:${'a'.repeat(64)}`,
            title: 'Rates Review',
          },
        },
      },
    });
    (generatedWorkflowServerConfigurationErrors as jest.Mock).mockReturnValue([
      'IDENTITY_ENDPOINT',
    ]);

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      error: 'WORKFLOW_SERVER_CONFIG_INVALID',
    });
  });

  it('fails closed when PublicAPI does not confirm the active deployment binding', async () => {
    (getGeneratedWorkflowRuntime as jest.Mock).mockReturnValue({
      status: 'ready',
      runtime: {
        tenantId: 'tenant-a',
        appKey: 'rates-review',
        binding: {
          workflowTemplate: {
            id: 'template-123',
            version: 1,
            digest: `sha256:${'a'.repeat(64)}`,
            title: 'Rates Review',
          },
        },
      },
    });
    (generatedWorkflowPlatformFetch as jest.Mock).mockResolvedValue({
      ok: false,
      status: 403,
    });

    const response = await GET();

    expect(response.status).toBe(503);
    await expect(response.json()).resolves.toEqual({
      status: 'unavailable',
      error: 'WORKFLOW_PLATFORM_UNAVAILABLE',
    });
  });
});
