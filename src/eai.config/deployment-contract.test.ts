import templateConfig from './default';
import {
  templateDeploymentContract,
  validateSecretRefDeclarations,
  validateTemplateDeploymentContract,
} from './deployment-contract';

describe('template deployment contract', () => {
  it('adds reference-only secret refs to eai.config', () => {
    expect(templateConfig.deploymentContract.secretRefs.required).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          name: 'AUTH_SECRET',
          required: true,
          secretRef: {
            kind: 'tenant-infra-envelope',
            name: 'AUTH_SECRET',
          },
        }),
        expect.objectContaining({
          name: 'ENTRA_CLIENT_SECRET',
          required: true,
          secretRef: {
            kind: 'tenant-infra-envelope',
            name: 'ENTRA_CLIENT_SECRET',
          },
        }),
      ]),
    );

    expect(
      validateTemplateDeploymentContract(templateConfig.deploymentContract),
    ).toEqual({ valid: true, errors: [] });
  });

  it('rejects plaintext-shaped fields in secretRef declarations', () => {
    const result = validateSecretRefDeclarations({
      required: [
        {
          ...templateDeploymentContract.secretRefs.required[0],
          value: 'sk-thisIsRawSecretMaterial1234567890',
        },
      ],
      optional: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'secretRefs.required[0].value must not contain plaintext secret material',
    );
  });

  it('rejects values that look like raw secrets even when the field name changes', () => {
    const result = validateSecretRefDeclarations({
      required: [
        {
          ...templateDeploymentContract.secretRefs.required[0],
          credentialRef: 'ghp_thisLooksLikeARawGithubToken000000',
        },
      ],
      optional: [],
    });

    expect(result.valid).toBe(false);
    expect(result.errors).toContain(
      'secretRefs.required[0].credentialRef looks like raw secret material',
    );
  });
});
