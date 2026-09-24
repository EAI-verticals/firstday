import { tenantConfigs, workflowSnapshots } from '@/eai.config';
import {
  resolveGeneratedWorkflowRuntime,
  type GeneratedWorkflowRuntimeResolution,
} from './runtime-contract';

function firstTenantKey(): string | undefined {
  return process.env.TENANT_KEYS?.split(',')
    .map((key) => key.trim())
    .find(Boolean);
}

/** Selects the source registry key from TenantInfra's server-owned app identity. */
export function generatedWorkflowAppKey(): string {
  return (
    process.env.EAI_PRODUCT_SLUG ||
    process.env.EAI_APP_KEY ||
    firstTenantKey() ||
    'template'
  );
}

/** Resolves source-controlled workflow bytes without reading mutable platform state. */
export function getGeneratedWorkflowRuntime(): GeneratedWorkflowRuntimeResolution {
  const appKey = generatedWorkflowAppKey();
  const configs = tenantConfigs as Record<string, unknown>;
  return resolveGeneratedWorkflowRuntime({
    appKey,
    config: configs[appKey] ?? configs.default,
    snapshot: workflowSnapshots[appKey] ?? workflowSnapshots.default,
  });
}
