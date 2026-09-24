import {
  generatedWorkflowSnapshotDigest,
  resolveGeneratedWorkflowRuntime,
  type GeneratedAppRuntimeBinding,
  type GeneratedWorkflowSnapshot,
} from './runtime-contract';

const snapshot: GeneratedWorkflowSnapshot = {
  reasoning: 'Keep the respondent journey short.',
  steps: [
    {
      id: 'contact',
      title: 'Contact details',
      fields: [
        {
          id: 'full-name',
          label: 'Full name',
          type: 'text',
          required: true,
        },
      ],
    },
  ],
};

function binding(): GeneratedAppRuntimeBinding {
  return {
    schemaVersion: 'eai.generated_app_runtime_binding.v1',
    workflowTemplate: {
      id: 'template-123',
      version: 3,
      digest: generatedWorkflowSnapshotDigest(snapshot),
      title: 'Rates Review',
    },
    respondentAccess: {
      mode: 'anonymous',
      submissionObjectType: 'workflow-submission',
      fileObjectType: 'submission-file',
    },
  };
}

describe('generated workflow runtime contract', () => {
  it('resolves a source-controlled snapshot when its binding digest matches', () => {
    expect(
      resolveGeneratedWorkflowRuntime({
        appKey: 'rates-review',
        config: {
          tenantId: 'tenant-a',
          runtimeBinding: binding(),
          generatedAppBranding: {
            displayName: 'Acme Council',
            primaryColor: '#123ABC',
            secondaryColor: '#EDF4FF',
            accentColor: '#F59E0B',
            logoDataUrl: 'data:image/png;base64,cHVibGljLWxvZ28=',
          },
        },
        snapshot,
      }),
    ).toEqual({
      status: 'ready',
      runtime: {
        appKey: 'rates-review',
        tenantId: 'tenant-a',
        binding: binding(),
        snapshot,
        branding: {
          displayName: 'Acme Council',
          primaryColor: '#123ABC',
          secondaryColor: '#EDF4FF',
          accentColor: '#F59E0B',
          logoDataUrl: 'data:image/png;base64,cHVibGljLWxvZ28=',
        },
      },
    });
  });

  it('drops unsafe optional branding without invalidating the workflow', () => {
    const result = resolveGeneratedWorkflowRuntime({
      appKey: 'rates-review',
      config: {
        tenantId: 'tenant-a',
        runtimeBinding: binding(),
        generatedAppBranding: {
          displayName: 'Acme Council',
          primaryColor: 'blue',
          logoDataUrl: 'data:text/html;base64,PHNjcmlwdD4=',
        },
      },
      snapshot,
    });

    expect(result).toMatchObject({
      status: 'ready',
      runtime: { branding: { displayName: 'Acme Council' } },
    });
  });

  it('fails closed when source changes without a regenerated binding', () => {
    const changedSnapshot: GeneratedWorkflowSnapshot = {
      ...snapshot,
      steps: [...snapshot.steps, { id: 'review', title: 'Review', fields: [] }],
    };

    expect(
      resolveGeneratedWorkflowRuntime({
        appKey: 'rates-review',
        config: {
          tenantId: 'tenant-a',
          runtimeBinding: binding(),
        },
        snapshot: changedSnapshot,
      }),
    ).toEqual({
      status: 'invalid',
      errors: ['workflow snapshot digest does not match runtimeBinding.'],
    });
  });

  it('preserves the base template fallback when no runtime binding is exported', () => {
    expect(
      resolveGeneratedWorkflowRuntime({
        appKey: 'template',
        config: { tenantId: 'template' },
        snapshot: undefined,
      }),
    ).toEqual({ status: 'unconfigured' });
  });
});
