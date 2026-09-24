import { fireEvent, render, screen, waitFor } from '@testing-library/react';

import { GeneratedWorkflowForm } from './workflow-form';
import type { GeneratedAppRuntimeBinding } from '@/lib/generated-workflow/runtime-contract';

const binding: GeneratedAppRuntimeBinding = {
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
};

describe('GeneratedWorkflowForm', () => {
  const originalFetch = global.fetch;

  beforeEach(() => {
    window.history.replaceState(null, '', '/');
    global.fetch = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({ submissionId: 'submission-1' }),
      })
      .mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ success: true }),
      });
  });

  afterEach(() => {
    global.fetch = originalFetch;
  });

  it('renders exported fields, validates required answers, and completes anonymously', async () => {
    render(
      <GeneratedWorkflowForm
        appKey='rates-review'
        binding={binding}
        snapshot={{
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
        }}
      />,
    );

    expect(screen.getByText('Contact details')).toBeVisible();
    const submit = await screen.findByRole('button', { name: 'Submit' });
    fireEvent.click(submit);
    expect(screen.getByText('This field is required.')).toBeVisible();

    fireEvent.change(screen.getByLabelText(/Full name/), {
      target: { value: 'Alex Respondent' },
    });
    fireEvent.click(submit);

    await waitFor(() => expect(screen.getByText('Submitted')).toBeVisible());
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/eai/workflow-submissions/submission-1',
      expect.objectContaining({
        method: 'PATCH',
        body: expect.stringContaining('Alex Respondent'),
      }),
    );
  });

  it('renders the exported company brand snapshot', async () => {
    render(
      <GeneratedWorkflowForm
        appKey='rates-review'
        binding={binding}
        branding={{
          displayName: 'Acme Council',
          primaryColor: '#123ABC',
          secondaryColor: '#EDF4FF',
          accentColor: '#F59E0B',
          logoDataUrl: 'data:image/png;base64,cHVibGljLWxvZ28=',
        }}
        snapshot={{ steps: [{ id: 'one', title: 'One', fields: [] }] }}
      />,
    );

    expect(screen.getByText('Acme Council')).toBeVisible();
    expect(screen.getByAltText('Acme Council logo')).toBeVisible();
    expect(await screen.findByRole('button', { name: 'Submit' })).toHaveStyle({
      backgroundColor: '#123ABC',
    });
  });

  it('renders canonical step blocks in order and persists declared outputs', async () => {
    render(
      <GeneratedWorkflowForm
        appKey='rates-review'
        binding={binding}
        snapshot={{
          steps: [
            {
              id: 'review',
              title: 'Review',
              fields: [],
              blocks: [
                {
                  id: 'approval-1',
                  blockId: 'approvals',
                  order: 20,
                  config: {
                    presentationConfig: { title: 'Manager approval' },
                    dataConfig: {},
                    businessLogic: {},
                    accessControl: {},
                    actionsConfig: {},
                  },
                  bindings: {
                    policy: { kind: 'literal', value: 'Rates policy' },
                  },
                  outputs: [
                    {
                      name: 'decision',
                      valueType: 'string',
                      required: true,
                    },
                  ],
                },
                {
                  id: 'checklist-1',
                  blockId: 'document-checklist',
                  order: 10,
                  config: {
                    presentationConfig: { title: 'Required documents' },
                    dataConfig: {},
                    businessLogic: {},
                    accessControl: {},
                    actionsConfig: {},
                  },
                  bindings: {},
                },
              ],
            },
          ],
        }}
      />,
    );

    await screen.findByRole('button', { name: 'Submit' });
    expect(
      screen
        .getByText('Required documents')
        .compareDocumentPosition(screen.getByText('Manager approval')) &
        Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));
    expect(
      screen.getByText('Complete the required guided activity outputs.'),
    ).toBeVisible();
    fireEvent.change(screen.getByLabelText(/decision/), {
      target: { value: 'approved' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Submit' }));

    await waitFor(() => expect(screen.getByText('Submitted')).toBeVisible());
    expect(global.fetch).toHaveBeenLastCalledWith(
      '/api/eai/workflow-submissions/submission-1',
      expect.objectContaining({
        body: expect.stringContaining(
          '"__blocks":{"approval-1.decision":"approved"}',
        ),
      }),
    );
  });

  it('fails visibly when a canonical block has no runtime adapter', async () => {
    render(
      <GeneratedWorkflowForm
        appKey='rates-review'
        binding={binding}
        snapshot={{
          steps: [
            {
              id: 'review',
              title: 'Review',
              blocks: [
                {
                  id: 'custom-1',
                  blockId: 'customer.unsupported',
                  order: 0,
                  config: {
                    presentationConfig: {},
                    dataConfig: {},
                    businessLogic: {},
                    accessControl: {},
                    actionsConfig: {},
                  },
                  bindings: {},
                },
              ],
            },
          ],
        }}
      />,
    );

    expect(
      await screen.findByText(/unsupported block “customer\.unsupported”/),
    ).toBeVisible();
    expect(
      await screen.findByRole('button', { name: 'Submit' }),
    ).toBeDisabled();
    expect(screen.queryByText('Submitted')).not.toBeInTheDocument();
  });
});
