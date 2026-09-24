import { render, screen } from '@testing-library/react';

import { HomeClient } from './home-client';

jest.mock('@enterpriseaigroup/demo', () => ({
  DemoPage: () => <div>Demo fallback</div>,
}));

jest.mock('@/components/generated-workflow/workflow-form', () => ({
  GeneratedWorkflowForm: ({
    branding,
  }: {
    branding?: { displayName?: string };
  }) => <div>{branding?.displayName ?? 'Generated workflow form'}</div>,
}));

describe('HomeClient generated workflow runtime', () => {
  it('exposes semantic workflow markers on the rendered root', () => {
    const { container } = render(
      <HomeClient
        generatedWorkflow={{
          appKey: 'rates-review',
          binding: {
            schemaVersion: 'eai.generated_app_runtime_binding.v1',
            workflowTemplate: {
              id: 'template-123',
              version: 2,
              digest: `sha256:${'a'.repeat(64)}`,
              title: 'Rates Review',
            },
            respondentAccess: {
              mode: 'anonymous',
              submissionObjectType: 'workflow-submission',
              fileObjectType: 'submission-file',
            },
          },
          branding: { displayName: 'Acme Council' },
          snapshot: { steps: [{ id: 'one', title: 'One', fields: [] }] },
        }}
      />,
    );

    const marker = container.querySelector('[data-eai-workflow-ready="true"]');
    expect(marker).toHaveAttribute(
      'data-eai-workflow-digest',
      `sha256:${'a'.repeat(64)}`,
    );
    expect(marker).toHaveAttribute('data-eai-workflow-title', 'Rates Review');
    expect(screen.getByText('Acme Council')).toBeVisible();
  });

  it('keeps the general template demo when no generated runtime is exported', () => {
    render(<HomeClient />);

    expect(screen.getByText('Demo fallback')).toBeVisible();
  });
});
