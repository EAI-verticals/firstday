import {
  APPROVED_SCHEMA_PROVENANCE,
  validateSchemaProvenance,
} from './schema-provenance';

describe('schema provenance contract', () => {
  it('accepts the platform-approved template schema provenance', () => {
    expect(validateSchemaProvenance(APPROVED_SCHEMA_PROVENANCE)).toEqual({
      valid: true,
      errors: [],
    });
  });

  it('rejects forged template versions', () => {
    const result = validateSchemaProvenance({
      ...APPROVED_SCHEMA_PROVENANCE,
      templateVersion: '999.0.0',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('templateVersion is not approved');
  });

  it('rejects schema digest mismatches', () => {
    const result = validateSchemaProvenance({
      ...APPROVED_SCHEMA_PROVENANCE,
      schemaDigest:
        'sha256:0000000000000000000000000000000000000000000000000000000000000000',
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain('schemaDigest is not approved');
  });
});
