import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const required = [
  'EAI_TENANT_ID',
  'EAI_WORKFLOW_ID',
  'BASE_URL_PUBLIC_API',
  'ROUTING_BOOTSTRAP_PUBLIC_API_URL',
  'ENTRA_TENANT_NAME',
  'ENTRA_TENANT_ID',
  'ENTRA_CLIENT_ID',
  'ENTRA_SCOPES',
  'ONBOARDING_DOCUMENT_WORKFLOW_KEY',
];
const vault = 'https://kv-demo-eai.vault.azure.net';
const subscription = '3001a4e4-fcd1-46e5-bfd9-e04ba193f65d';
const scope = [
  '--subscription',
  subscription,
  '--resource-group',
  'rg-demo-infrastructure',
  '--name',
  'firstday',
];

/** Requires approved tenant identifiers; secret values never enter the generated configuration. */
export function configuration(env) {
  const missing = required.filter((key) => !env[key]?.trim());
  if (missing.length)
    throw new Error(
      `Missing GitHub repository variables: ${missing.join(', ')}`,
    );
  for (const key of required) {
    if (/\s/.test(env[key]) && key !== 'ENTRA_SCOPES')
      throw new Error(`Invalid whitespace in ${key}`);
  }
  for (const key of [
    'BASE_URL_PUBLIC_API',
    'ROUTING_BOOTSTRAP_PUBLIC_API_URL',
  ]) {
    const url = new URL(env[key]);
    if (url.protocol !== 'https:' || url.username || url.password)
      throw new Error(`Invalid HTTPS URL in ${key}`);
  }
  const result = {
    NODE_ENV: 'production',
    NEXT_PUBLIC_APP_NAME: 'firstday',
    EAI_APP_KEY: 'firstday',
    EAI_PRODUCT_SLUG: 'firstday',
    APP_BASE_PATH: '',
    NEXT_PUBLIC_APP_BASE_PATH: '',
    NEXT_PUBLIC_EAI_TENANT_ID: env.EAI_TENANT_ID,
    EAI_TENANT_ID: env.EAI_TENANT_ID,
    BASE_URL_PUBLIC_API: env.BASE_URL_PUBLIC_API,
    ROUTING_BOOTSTRAP_PUBLIC_API_URL: env.ROUTING_BOOTSTRAP_PUBLIC_API_URL,
    EAI_ENVIRONMENT: 'demo',
    TENANT_KEYS: 'vending-machine-app',
    TENANT_VENDING_MACHINE_APP_ID: env.EAI_TENANT_ID,
    WORKFLOW_VENDING_MACHINE_APP_ID: env.EAI_WORKFLOW_ID,
    WORKFLOW_ONBOARDING_ID: env.EAI_WORKFLOW_ID,
    ONBOARDING_DOCUMENT_WORKFLOW_KEY: env.ONBOARDING_DOCUMENT_WORKFLOW_KEY,
    ENTRA_TENANT_NAME: env.ENTRA_TENANT_NAME,
    ENTRA_TENANT_ID: env.ENTRA_TENANT_ID,
    ENTRA_CLIENT_ID: env.ENTRA_CLIENT_ID,
    ENTRA_SCOPES: env.ENTRA_SCOPES,
    AUTH_URL: 'https://firstday.demo.eaigroup.ai/api/auth',
    AUTH_TRUST_HOST: 'true',
  };
  result.EAI_CONFIG_HASH = createHash('sha256')
    .update(JSON.stringify(result))
    .digest('hex');
  return result;
}

function azure(args) {
  return execFileSync('az', args, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  }).trim();
}

/** Rejects credentials for a different Azure target without including credential values in errors. */
export function validateCredential(value) {
  let credential;
  try {
    credential = JSON.parse(value || '');
  } catch {
    throw new Error('AZURE_CREDENTIALS must contain service principal JSON');
  }
  if (
    !credential ||
    typeof credential !== 'object' ||
    ['clientId', 'clientSecret', 'subscriptionId', 'tenantId'].some(
      (key) => typeof credential[key] !== 'string' || !credential[key],
    )
  ) {
    throw new Error(
      'AZURE_CREDENTIALS is missing required service principal fields',
    );
  }
  if (
    credential.subscriptionId !== subscription ||
    credential.tenantId !== '6a5ef618-53d3-4f7a-8f20-cbf7d8b6aedc'
  ) {
    throw new Error(
      'AZURE_CREDENTIALS does not match the approved demo subscription and Azure tenant',
    );
  }
}

async function main() {
  const config = configuration(process.env);
  if (process.argv[2] === 'check') {
    if (!process.env.AZURE_CREDENTIALS)
      throw new Error('Missing GitHub secret: AZURE_CREDENTIALS');
    validateCredential(process.env.AZURE_CREDENTIALS);
    console.log('Required deployment configuration is present');
    return;
  }
  if (!['check-secrets', 'configure'].includes(process.argv[2]))
    throw new Error('Expected check, check-secrets, or configure');
  const secretNames = [
    'firstday-auth-secret',
    'firstday-entra-client-secret',
    'firstday-readiness-probe-token',
  ];
  for (const name of secretNames) {
    azure([
      'keyvault',
      'secret',
      'show',
      '--vault-name',
      'kv-demo-eai',
      '--name',
      name,
      '--query',
      'id',
      '-o',
      'tsv',
    ]);
  }
  if (process.argv[2] === 'check-secrets') {
    console.log('Required Key Vault secret references are accessible');
    return;
  }
  azure([
    'containerapp',
    'secret',
    'set',
    ...scope,
    '--secrets',
    ...secretNames.map(
      (name) =>
        `${name}=keyvaultref:${vault}/secrets/${name},identityref:system`,
    ),
    '-o',
    'none',
  ]);
  const references = {
    AUTH_SECRET: secretNames[0],
    ENTRA_CLIENT_SECRET: secretNames[1],
    EAI_READINESS_PROBE_TOKEN: secretNames[2],
  };
  azure([
    'containerapp',
    'update',
    ...scope,
    '--set-env-vars',
    ...Object.entries(config).map(([key, value]) => `${key}=${value}`),
    ...Object.entries(references).map(
      ([key, name]) => `${key}=secretref:${name}`,
    ),
    '-o',
    'none',
  ]);
  const token = azure([
    'keyvault',
    'secret',
    'show',
    '--vault-name',
    'kv-demo-eai',
    '--name',
    secretNames[2],
    '--query',
    'value',
    '-o',
    'tsv',
  ]);
  const origin = 'https://firstday.demo.eaigroup.ai';
  let ready = false;
  for (let attempt = 0; attempt < 12; attempt++) {
    try {
      const health = await fetch(`${origin}/health`, {
        signal: AbortSignal.timeout(10000),
      });
      const readiness = await fetch(`${origin}/api/eai/readiness`, {
        signal: AbortSignal.timeout(10000),
        headers: {
          authorization: `Bearer ${token}`,
          'x-eai-readiness-probe': 'tenantinfra',
          'x-eai-tenant-id': config.EAI_TENANT_ID,
          'x-eai-app-key': 'firstday',
          'x-eai-environment': 'demo',
          'x-eai-config-hash': config.EAI_CONFIG_HASH,
        },
      });
      const body = await readiness.json();
      if (health.ok && readiness.ok && body.ok === true) {
        ready = true;
        break;
      }
    } catch {
      /* A new revision can take time to become routable. */
    }
    await new Promise((resolve) => setTimeout(resolve, 10000));
  }
  if (!ready)
    throw new Error(
      'Deployed health/readiness did not pass; deployment is incomplete',
    );
  console.log(`Health and authenticated readiness passed: ${origin}`);
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  main().catch((error) => {
    console.error(
      error instanceof Error && !('stderr' in error)
        ? error.message
        : 'Azure configuration failed; check identity permissions and secret references',
    );
    process.exitCode = 1;
  });
}
