/**
 * Runtime Configuration Endpoint
 *
 * Returns environment-specific configuration values that are set at runtime
 * (not baked into the build).
 *
 * Tenant config env vars follow the naming convention:
 * - TENANT_{KEY}_ID   — Configurator tenant record ID
 * - WORKFLOW_{KEY}_ID  — Configurator workflow record ID
 *
 * where {KEY} is the UPPER_CASE tenant slug (e.g., TENANT_MYAPP_ID).
 * The set of tenant keys is driven by TENANT_KEYS (comma-separated).
 */

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

import type { RuntimeConfig } from '@enterpriseaigroup/core';

/**
 * Reads tenant keys from TENANT_KEYS env var (comma-separated, e.g. "template,other").
 * Falls back to 'template' when not set.
 */
function getTenantKeys(): string[] {
  const raw = process.env.TENANT_KEYS;
  if (!raw) return ['template'];
  return raw.split(',').map((k) => k.trim()).filter(Boolean);
}

export async function GET() {
  const tenantKeys = getTenantKeys();

  const tenants: RuntimeConfig['tenants'] = {};
  for (const key of tenantKeys) {
    const envKey = key.toUpperCase().replace(/-/g, '_');
    tenants[key] = {
      tenantId: process.env[`TENANT_${envKey}_ID`],
      workflowId: process.env[`WORKFLOW_${envKey}_ID`],
    };
  }

  const config: RuntimeConfig = {
    tenants,
  };

  return Response.json(config, {
    headers: {
      'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
      Pragma: 'no-cache',
      Expires: '0',
    },
  });
}
