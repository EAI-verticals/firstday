import { objectTypes } from '../../eai.config/object-types';
import { templateDeploymentContract } from '../../eai.config/deployment-contract';

export type ReadinessFailureCategory =
  | 'config_missing'
  | 'secret_missing'
  | 'object_types_missing'
  | 'storage_not_ready'
  | 'auth_misconfigured'
  | 'publicapi_unreachable'
  | 'tenant_assignment_invalid';

export interface ReadinessCheck {
  name: string;
  ok: boolean;
  category?: ReadinessFailureCategory;
  missing?: string[];
}

export interface RuntimeReadiness {
  ok: boolean;
  service: string;
  checks: ReadinessCheck[];
  failureCategories: ReadinessFailureCategory[];
}

const REQUIRED_RUNTIME_ENV = [
  'NEXT_PUBLIC_APP_NAME',
  'APP_BASE_PATH',
  'NEXT_PUBLIC_APP_BASE_PATH',
  'BASE_URL_PUBLIC_API',
  'ROUTING_BOOTSTRAP_PUBLIC_API_URL',
  'EAI_ENVIRONMENT',
  'EAI_CONFIG_HASH',
  'TENANT_KEYS',
  'ENTRA_TENANT_NAME',
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
  'ENTRA_SCOPES',
  'AUTH_URL',
  'AUTH_TRUST_HOST',
];

function splitTenantKeys(env: NodeJS.ProcessEnv): string[] {
  return (env.TENANT_KEYS ?? '')
    .split(',')
    .map((key) => key.trim())
    .filter(Boolean);
}

function missingEnv(env: NodeJS.ProcessEnv, names: string[]): string[] {
  return names.filter((name) => !env[name]);
}

function missingAnyEnv(env: NodeJS.ProcessEnv, groups: string[][]): string[] {
  return groups.flatMap((group) =>
    group.some((name) => env[name]) ? [] : [group.join('|')],
  );
}

function envKeyForTenant(tenantKey: string): string {
  return tenantKey.toUpperCase().replace(/-/g, '_');
}

function isHttpUrl(value: string | undefined): boolean {
  if (!value) {
    return false;
  }
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function checkRuntimeEnv(env: NodeJS.ProcessEnv): ReadinessCheck {
  const missing = [
    ...missingEnv(env, REQUIRED_RUNTIME_ENV),
    ...missingAnyEnv(env, [
      ['NEXT_PUBLIC_EAI_TENANT_ID', 'EAI_TENANT_ID'],
      ['EAI_PRODUCT_SLUG', 'EAI_APP_KEY'],
    ]),
  ];
  return {
    name: 'runtime-env',
    ok: missing.length === 0,
    category: missing.length > 0 ? 'config_missing' : undefined,
    missing,
  };
}

function checkRequiredSecrets(env: NodeJS.ProcessEnv): ReadinessCheck {
  const requiredSecretNames =
    templateDeploymentContract.secretRefs.required.map((secret) => secret.name);
  const missing = missingEnv(env, requiredSecretNames);
  return {
    name: 'runtime-secrets',
    ok: missing.length === 0,
    category: missing.length > 0 ? 'secret_missing' : undefined,
    missing,
  };
}

function checkAuth(env: NodeJS.ProcessEnv): ReadinessCheck {
  const missing = missingEnv(env, [
    'AUTH_URL',
    'AUTH_SECRET',
    'ENTRA_CLIENT_ID',
    'ENTRA_CLIENT_SECRET',
  ]);
  return {
    name: 'auth',
    ok: missing.length === 0,
    category: missing.length > 0 ? 'auth_misconfigured' : undefined,
    missing,
  };
}

function checkTenantAssignment(env: NodeJS.ProcessEnv): ReadinessCheck {
  const tenantKeys = splitTenantKeys(env);
  const missing = tenantKeys.flatMap((tenantKey) => {
    const envKey = envKeyForTenant(tenantKey);
    return missingEnv(env, [`TENANT_${envKey}_ID`, `WORKFLOW_${envKey}_ID`]);
  });

  return {
    name: 'tenant-assignment',
    ok: tenantKeys.length > 0 && missing.length === 0,
    category:
      tenantKeys.length === 0 || missing.length > 0
        ? 'tenant_assignment_invalid'
        : undefined,
    missing:
      tenantKeys.length === 0
        ? ['TENANT_KEYS']
        : Array.from(new Set(missing)).sort(),
  };
}

function checkPublicApi(env: NodeJS.ProcessEnv): ReadinessCheck {
  const ok =
    isHttpUrl(env.BASE_URL_PUBLIC_API) &&
    isHttpUrl(env.ROUTING_BOOTSTRAP_PUBLIC_API_URL);
  return {
    name: 'publicapi-config',
    ok,
    category: ok ? undefined : 'publicapi_unreachable',
    missing: ok
      ? []
      : ['BASE_URL_PUBLIC_API', 'ROUTING_BOOTSTRAP_PUBLIC_API_URL'].filter(
          (name) => !isHttpUrl(env[name]),
        ),
  };
}

function checkObjectTypes(env: NodeJS.ProcessEnv): ReadinessCheck {
  const tenantKeys = splitTenantKeys(env);
  const missing = tenantKeys.filter((tenantKey) => !objectTypes[tenantKey]);
  return {
    name: 'object-types',
    ok: tenantKeys.length > 0 && missing.length === 0,
    category:
      tenantKeys.length === 0 || missing.length > 0
        ? 'object_types_missing'
        : undefined,
    missing:
      tenantKeys.length === 0
        ? ['TENANT_KEYS']
        : missing.map((tenantKey) => `objectTypes.${tenantKey}`),
  };
}

export function evaluateRuntimeReadiness(
  env: NodeJS.ProcessEnv = process.env,
): RuntimeReadiness {
  const checks = [
    checkRuntimeEnv(env),
    checkRequiredSecrets(env),
    checkAuth(env),
    checkTenantAssignment(env),
    checkPublicApi(env),
    checkObjectTypes(env),
  ];
  const failureCategories = Array.from(
    new Set(
      checks.flatMap((check) => (check.category ? [check.category] : [])),
    ),
  ).sort();

  return {
    ok: checks.every((check) => check.ok),
    service: env.NEXT_PUBLIC_APP_NAME || 'eai-app-template',
    checks,
    failureCategories,
  };
}
