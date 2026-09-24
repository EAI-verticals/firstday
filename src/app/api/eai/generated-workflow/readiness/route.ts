import { getGeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime';
import { generatedWorkflowServerConfigurationErrors } from '@/lib/generated-workflow/server-configuration';
import { generatedWorkflowPlatformFetch } from '@/lib/generated-workflow/platform';
import { validateGeneratedAppRuntimeBinding } from '@/lib/generated-workflow/runtime-contract';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

/** Proves source digest plus the deployed UAMI binding without exposing tenant details. */
export async function GET(): Promise<Response> {
  const resolved = getGeneratedWorkflowRuntime();
  if (resolved.status !== 'ready') {
    return Response.json(
      {
        status: 'unavailable',
        error:
          resolved.status === 'invalid'
            ? 'WORKFLOW_SNAPSHOT_INVALID'
            : 'WORKFLOW_RUNTIME_UNCONFIGURED',
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  if (generatedWorkflowServerConfigurationErrors().length > 0) {
    return Response.json(
      {
        status: 'unavailable',
        error: 'WORKFLOW_SERVER_CONFIG_INVALID',
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }
  try {
    const platformResponse = await generatedWorkflowPlatformFetch({
      tenantId: resolved.runtime.tenantId,
      appKey: resolved.runtime.appKey,
      path: '/workflow',
    });
    if (!platformResponse.ok) {
      throw new Error('platform-unavailable');
    }
    const platformPayload = (await platformResponse.json()) as {
      runtimeBinding?: unknown;
    };
    if (
      !validateGeneratedAppRuntimeBinding(platformPayload.runtimeBinding) ||
      platformPayload.runtimeBinding.workflowTemplate.id !==
        resolved.runtime.binding.workflowTemplate.id ||
      platformPayload.runtimeBinding.workflowTemplate.version !==
        resolved.runtime.binding.workflowTemplate.version ||
      platformPayload.runtimeBinding.workflowTemplate.digest !==
        resolved.runtime.binding.workflowTemplate.digest
    ) {
      throw new Error('platform-binding-mismatch');
    }
  } catch {
    return Response.json(
      {
        status: 'unavailable',
        error: 'WORKFLOW_PLATFORM_UNAVAILABLE',
      },
      { status: 503, headers: NO_STORE_HEADERS },
    );
  }

  return Response.json(
    {
      status: 'ready',
      workflowTemplate: {
        digest: resolved.runtime.binding.workflowTemplate.digest,
        title: resolved.runtime.binding.workflowTemplate.title,
      },
    },
    { headers: NO_STORE_HEADERS },
  );
}
