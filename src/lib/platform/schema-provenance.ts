export interface SchemaProvenance {
  templateVersion: string;
  baseTemplateSha: string;
  schemaDigest: string;
  validatorDigest: string;
}

export interface SchemaProvenanceValidation {
  valid: boolean;
  errors: string[];
}

export const APPROVED_SCHEMA_PROVENANCE: SchemaProvenance = {
  templateVersion: '0.1.0',
  baseTemplateSha: '3fa18d004b20ff409ab9687d623028f24d9e5543',
  schemaDigest:
    'sha256:acfb58ff43dc69923c642338031d169cb93c669cd99cdf159c3af42e88c2bdf5',
  validatorDigest:
    'sha256:47ad55b69d7fbe8e9e2c5dcb156b1198f759ffb478f4e8ee8ca1e874c77df819',
};

const SHA256_DIGEST_PATTERN = /^sha256:[a-f0-9]{64}$/;
const COMMIT_SHA_PATTERN = /^[a-f0-9]{40}$/;

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function readString(
  value: Record<string, unknown>,
  key: keyof SchemaProvenance,
): string {
  const candidate = value[key];
  return typeof candidate === 'string' ? candidate.trim() : '';
}

export function validateSchemaProvenance(
  value: unknown,
  approved: SchemaProvenance = APPROVED_SCHEMA_PROVENANCE,
): SchemaProvenanceValidation {
  const errors: string[] = [];

  if (!isRecord(value)) {
    return { valid: false, errors: ['schema provenance must be an object'] };
  }

  const actual: SchemaProvenance = {
    templateVersion: readString(value, 'templateVersion'),
    baseTemplateSha: readString(value, 'baseTemplateSha'),
    schemaDigest: readString(value, 'schemaDigest'),
    validatorDigest: readString(value, 'validatorDigest'),
  };

  if (!COMMIT_SHA_PATTERN.test(actual.baseTemplateSha)) {
    errors.push('baseTemplateSha must be a 40 character lowercase git SHA');
  }
  if (!SHA256_DIGEST_PATTERN.test(actual.schemaDigest)) {
    errors.push('schemaDigest must be a sha256 digest');
  }
  if (!SHA256_DIGEST_PATTERN.test(actual.validatorDigest)) {
    errors.push('validatorDigest must be a sha256 digest');
  }

  for (const key of Object.keys(approved) as Array<keyof SchemaProvenance>) {
    if (actual[key] !== approved[key]) {
      errors.push(`${key} is not approved`);
    }
  }

  return { valid: errors.length === 0, errors };
}
