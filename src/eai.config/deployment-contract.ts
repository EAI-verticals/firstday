export type DeploymentEnvironment = 'dev' | 'test' | 'prod' | 'demo';

export type SourceMode = 'admin-portal-generated' | 'existing-eai-app';

export type SecretRefKind =
  | 'tenant-infra-envelope'
  | 'app-config-secret-ref'
  | 'environment-variable';

export interface SecretRef {
  kind: SecretRefKind;
  name: string;
}

export interface SecretRefDeclaration {
  name: string;
  purpose: 'auth' | 'integration' | 'readiness-probe-auth';
  required: boolean;
  environments: DeploymentEnvironment[];
  restartRequired: boolean;
  displayName: string;
  secretRef: SecretRef;
}

export interface TemplateDeploymentContract {
  app: {
    appKey: string;
    displayName: string;
    sourceMode: SourceMode;
    templateVersion: string;
    supportedEnvironments: DeploymentEnvironment[];
  };
  deployment: {
    target: 'container-apps';
    healthPath: string;
    readinessPath: string;
    containerPort: number;
    workflow: {
      name: string;
      path: string;
    };
  };
  secretRefs: {
    required: SecretRefDeclaration[];
    optional: SecretRefDeclaration[];
  };
}

export interface DeploymentContractValidation {
  valid: boolean;
  errors: string[];
}

const ENV_NAME_PATTERN = /^[A-Z][A-Z0-9_]*$/;
const PATH_PATTERN = /^\/[A-Za-z0-9._~!$&'()*+,;=:@/-]*$/;
const FORBIDDEN_SECRET_VALUE_KEYS = new Set([
  'apiKey',
  'api_key',
  'clientSecret',
  'client_secret',
  'connectionString',
  'password',
  'plainText',
  'plaintext',
  'secret',
  'secretValue',
  'secret_value',
  'token',
  'value',
]);

const RAW_SECRET_VALUE_PATTERNS = [
  /^sk-[A-Za-z0-9_-]{16,}$/,
  /^ghp_[A-Za-z0-9_]{20,}$/,
  /^github_pat_[A-Za-z0-9_]{20,}$/,
  /^eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{10,}$/,
  /^-----BEGIN [A-Z ]+ PRIVATE KEY-----/,
];

export const templateDeploymentContract: TemplateDeploymentContract = {
  app: {
    appKey: 'eai-app-template',
    displayName: 'EAI App Template',
    sourceMode: 'admin-portal-generated',
    templateVersion: '0.1.0',
    supportedEnvironments: ['dev', 'test', 'prod', 'demo'],
  },
  deployment: {
    target: 'container-apps',
    healthPath: '/health',
    readinessPath: '/api/eai/readiness',
    containerPort: 3000,
    workflow: {
      name: 'EAI App Deployment',
      path: '.github/workflows/eai-app.yml',
    },
  },
  secretRefs: {
    required: [
      {
        name: 'AUTH_SECRET',
        purpose: 'auth',
        required: true,
        environments: ['dev', 'test', 'prod', 'demo'],
        restartRequired: true,
        displayName: 'Auth.js session signing secret',
        secretRef: {
          kind: 'tenant-infra-envelope',
          name: 'AUTH_SECRET',
        },
      },
      {
        name: 'ENTRA_CLIENT_SECRET',
        purpose: 'auth',
        required: true,
        environments: ['dev', 'test', 'prod', 'demo'],
        restartRequired: true,
        displayName: 'Microsoft Entra client secret',
        secretRef: {
          kind: 'tenant-infra-envelope',
          name: 'ENTRA_CLIENT_SECRET',
        },
      },
      {
        name: 'EAI_READINESS_PROBE_TOKEN',
        purpose: 'readiness-probe-auth',
        required: true,
        environments: ['dev', 'test', 'prod', 'demo'],
        restartRequired: true,
        displayName: 'TenantInfra readiness probe bearer token',
        secretRef: {
          kind: 'tenant-infra-envelope',
          name: 'EAI_READINESS_PROBE_TOKEN',
        },
      },
    ],
    optional: [],
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readPath(value: unknown, path: string): unknown {
  return path.split('.').reduce<unknown>((current, segment) => {
    if (!isRecord(current)) {
      return undefined;
    }
    return current[segment];
  }, value);
}

function secretLooksLikeRawValue(value: string): boolean {
  const trimmed = value.trim();
  if (!trimmed) {
    return false;
  }
  return RAW_SECRET_VALUE_PATTERNS.some((pattern) => pattern.test(trimmed));
}

function inspectForPlaintextSecretFields(
  value: unknown,
  path: string,
  errors: string[],
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      inspectForPlaintextSecretFields(entry, `${path}[${index}]`, errors);
    });
    return;
  }

  if (!isRecord(value)) {
    return;
  }

  for (const [key, nestedValue] of Object.entries(value)) {
    const nestedPath = `${path}.${key}`;
    if (FORBIDDEN_SECRET_VALUE_KEYS.has(key)) {
      errors.push(`${nestedPath} must not contain plaintext secret material`);
      continue;
    }
    if (
      typeof nestedValue === 'string' &&
      secretLooksLikeRawValue(nestedValue)
    ) {
      errors.push(`${nestedPath} looks like raw secret material`);
      continue;
    }
    inspectForPlaintextSecretFields(nestedValue, nestedPath, errors);
  }
}

function validateSecretRefDeclaration(
  declaration: unknown,
  path: string,
  expectedRequired: boolean,
  errors: string[],
): void {
  if (!isRecord(declaration)) {
    errors.push(`${path} must be an object`);
    return;
  }

  const name = declaration.name;
  if (typeof name !== 'string' || !ENV_NAME_PATTERN.test(name)) {
    errors.push(`${path}.name must be an environment-style secret name`);
  }
  if (declaration.required !== expectedRequired) {
    errors.push(`${path}.required must be ${String(expectedRequired)}`);
  }
  if (!isRecord(declaration.secretRef)) {
    errors.push(`${path}.secretRef must be an object`);
  } else {
    const secretRefName = declaration.secretRef.name;
    if (
      typeof secretRefName !== 'string' ||
      !ENV_NAME_PATTERN.test(secretRefName)
    ) {
      errors.push(`${path}.secretRef.name must be an environment-style name`);
    }
    if (secretRefName !== name) {
      errors.push(`${path}.secretRef.name must match ${path}.name`);
    }
  }

  inspectForPlaintextSecretFields(declaration, path, errors);
}

export function validateSecretRefDeclarations(
  value: unknown,
  basePath = 'secretRefs',
): DeploymentContractValidation {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: [`${basePath} must be an object`] };
  }

  for (const key of ['required', 'optional'] as const) {
    const declarations = value[key];
    if (!Array.isArray(declarations)) {
      errors.push(`${basePath}.${key} must be an array`);
      continue;
    }
    declarations.forEach((declaration, index) => {
      validateSecretRefDeclaration(
        declaration,
        `${basePath}.${key}[${index}]`,
        key === 'required',
        errors,
      );
    });
  }

  return { valid: errors.length === 0, errors };
}

export function validateTemplateDeploymentContract(
  value: unknown,
): DeploymentContractValidation {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return {
      valid: false,
      errors: ['deployment contract must be an object'],
    };
  }

  if (readPath(value, 'deployment.target') !== 'container-apps') {
    errors.push('deployment.target must be container-apps');
  }

  for (const path of ['deployment.healthPath', 'deployment.readinessPath']) {
    const endpoint = readPath(value, path);
    if (typeof endpoint !== 'string' || !PATH_PATTERN.test(endpoint)) {
      errors.push(`${path} must be an absolute path`);
    }
  }

  const secretRefsResult = validateSecretRefDeclarations(
    readPath(value, 'secretRefs'),
  );
  errors.push(...secretRefsResult.errors);

  return { valid: errors.length === 0, errors };
}
