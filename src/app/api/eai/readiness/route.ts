import { evaluateRuntimeReadiness } from '@/lib/platform/readiness';
import { getGeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

type ProbeFailureCategory = 'auth_misconfigured' | 'tenant_assignment_invalid';

const readinessProbeTokenEnvKey = ['EAI', 'READINESS', 'PROBE', 'TOKEN'].join(
  '_',
);

function probeFailure(
  category: ProbeFailureCategory,
  status: number,
): Response {
  return Response.json(
    {
      ok: false,
      service: process.env.NEXT_PUBLIC_APP_NAME || 'eai-app-template',
      checks: [{ name: 'tenantinfra-probe', ok: false, category }],
      failureCategories: [category],
    },
    {
      status,
      headers: {
        'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      },
    },
  );
}

function requireHeader(
  headers: Headers,
  name: string,
  expected: string | undefined,
): boolean {
  return !expected || headers.get(name) === expected;
}

function runtimeTenantId(): string | undefined {
  return process.env.NEXT_PUBLIC_EAI_TENANT_ID || process.env.EAI_TENANT_ID;
}

function runtimeAppKey(): string | undefined {
  return process.env.EAI_PRODUCT_SLUG || process.env.EAI_APP_KEY;
}

function validateTenantInfraProbe(request: Request): Response | null {
  const headers = request.headers;

  if (headers.get('x-eai-readiness-probe') !== 'tenantinfra') {
    return probeFailure('auth_misconfigured', 401);
  }

  const token = process.env[readinessProbeTokenEnvKey];
  if (!token) {
    return probeFailure('auth_misconfigured', 503);
  }
  if (headers.get('authorization') !== `Bearer ${token}`) {
    return probeFailure('auth_misconfigured', 401);
  }

  const scopeMatches =
    requireHeader(headers, 'x-eai-tenant-id', runtimeTenantId()) &&
    requireHeader(headers, 'x-eai-app-key', runtimeAppKey()) &&
    requireHeader(headers, 'x-eai-environment', process.env.EAI_ENVIRONMENT) &&
    requireHeader(headers, 'x-eai-config-hash', process.env.EAI_CONFIG_HASH);

  if (!scopeMatches) {
    return probeFailure('tenant_assignment_invalid', 403);
  }

  return null;
}

/** Returns authenticated deployment checks plus bound workflow proof when configured. */
export async function GET(request: Request): Promise<Response> {
  const probeFailureResponse = validateTenantInfraProbe(request);
  if (probeFailureResponse) {
    return probeFailureResponse;
  }

  const readiness = evaluateRuntimeReadiness();
  const workflowRuntime = getGeneratedWorkflowRuntime();
  const responseBody =
    workflowRuntime.status === 'ready'
      ? {
          ...readiness,
          runtimeBinding: {
            workflowTemplate: {
              digest: workflowRuntime.runtime.binding.workflowTemplate.digest,
              title: workflowRuntime.runtime.binding.workflowTemplate.title,
            },
          },
        }
      : workflowRuntime.status === 'invalid'
        ? {
            ...readiness,
            ok: false,
            checks: [
              ...readiness.checks,
              {
                name: 'generated-workflow-snapshot',
                ok: false,
                category: 'config_missing' as const,
                missing: ['runtimeBinding.workflowTemplate.digest'],
              },
            ],
            failureCategories: Array.from(
              new Set([...readiness.failureCategories, 'config_missing']),
            ).sort(),
          }
        : readiness;

  return Response.json(responseBody, {
    status: responseBody.ok ? 200 : 503,
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
    },
  });
}
