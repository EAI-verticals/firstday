import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { useEffect, useState } from 'react';
import { ResourcesWorkspace } from './resources-workspace';
import { SessionDraftProvider, useSessionDraft } from './session-draft';
import {
  EXAMPLE_PROFILE,
  EMPTY_PROFILE,
} from '@/lib/onboarding/employee-workflow';
import {
  downloadPdf,
  generateCheckedDocument,
  generateDocument,
  readDocument,
} from '@/lib/onboarding/files';
import { draftAi, reviewAi, type AiRuntime } from '@/lib/onboarding/ai';
import type { WorkspaceRole } from '@/lib/onboarding/roles';

let profile = { ...EMPTY_PROFILE };
jest.mock('./workspace-shell', () => ({
  WorkspaceShell: ({
    children,
    onNavigate,
  }: {
    children: React.ReactNode;
    onNavigate: (page: string) => void;
  }) => (
    <div>
      <button onClick={() => onNavigate('check')}>
        Open checklist checker
      </button>
      <button onClick={() => onNavigate('templates')}>Forms page</button>
      {children}
    </div>
  ),
}));
jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: 'authenticated' }),
}));
jest.mock('@/lib/onboarding/ai', () => ({
  draftAi: jest.fn(),
  reviewAi: jest.fn(),
}));
jest.mock('@/lib/onboarding/files', () => ({
  downloadPdf: jest.fn(),
  generateDocument: jest.fn(async () => new Uint8Array([1])),
  generateCheckedDocument: jest.fn(async () => new Uint8Array([2])),
  readDocument: jest.fn(),
}));
const runtime: AiRuntime = {
  configured: true,
  tenantId: 'tenant',
  workflowId: 'workflow',
  stages: { answer: 'answer', generate: 'generate', review: 'review' },
};
const read = jest.mocked(readDocument);
let currentDraft: ReturnType<typeof useSessionDraft>['draft'];
function Seed(): null {
  const { draft, setDraft } = useSessionDraft();
  currentDraft = draft;
  useEffect(() => {
    setDraft((previous) => ({ ...previous, profile }));
  }, [setDraft]);
  return null;
}
function Walkthrough({ role }: { role: WorkspaceRole }): React.ReactNode {
  const [open, setOpen] = useState(true);
  return open ? (
    <ResourcesWorkspace
      role={role}
      onChangeRole={() => setOpen(false)}
      onBack={() => setOpen(false)}
      preview
      runtime={runtime}
    />
  ) : (
    <button onClick={() => setOpen(true)}>Reopen resources</button>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  profile = { ...EMPTY_PROFILE };
});
const begin = (role: WorkspaceRole = 'employee'): void => {
  render(
    <SessionDraftProvider>
      <Seed />
      <Walkthrough role={role} />
    </SessionDraftProvider>,
  );
};

it('requires shared employee details for personalized templates while permitting a blank deposit form', async () => {
  begin();
  expect(screen.getByRole('button', { name: 'Download PDF' })).toBeDisabled();
  fireEvent.click(screen.getByRole('radio', { name: /Direct deposit form/ }));
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() =>
    expect(downloadPdf).toHaveBeenCalledWith(
      expect.any(Uint8Array),
      'deposit-blank.pdf',
    ),
  );
  expect(generateDocument).toHaveBeenCalledWith(
    'deposit',
    expect.objectContaining({ name: '' }),
    undefined,
  );
  expect(draftAi).not.toHaveBeenCalled();
});

it('limits Employee forms to the checklist and bank details', () => {
  begin();
  expect(screen.getAllByRole('radio')).toHaveLength(2);
  expect(
    screen.getByRole('radio', { name: /Onboarding checklist/ }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('radio', { name: /Direct deposit form/ }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('radio', { name: /Welcome email/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('radio', { name: /IT setup sheet/ }),
  ).not.toBeInTheDocument();
});

it.each(['admin'] as const)(
  'keeps all four templates available to %s',
  (role) => {
    begin(role);
    expect(screen.getAllByRole('radio')).toHaveLength(4);
    expect(
      screen.getByRole('radio', { name: /Welcome email/ }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('radio', { name: /IT setup sheet/ }),
    ).toBeInTheDocument();
  },
);

it('labels every Admin return control with its actual Settings destination', () => {
  begin('admin');
  const returnControls = screen.getAllByRole('button', {
    name: 'Back to Settings',
  });
  expect(returnControls).toHaveLength(2);
  expect(
    screen.queryByRole('button', { name: 'Back to Home' }),
  ).not.toBeInTheDocument();
  fireEvent.click(returnControls[1]);
  expect(
    screen.getByRole('button', { name: 'Reopen resources' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Reopen resources' }));
  fireEvent.click(
    screen.getAllByRole('button', { name: 'Back to Settings' })[0],
  );
  expect(
    screen.getByRole('button', { name: 'Reopen resources' }),
  ).toBeInTheDocument();
});

it('downloads a blank bank form without applying an earlier AI draft selection', async () => {
  profile = { ...EXAMPLE_PROFILE };
  begin('admin');
  fireEvent.click(screen.getByLabelText('Use an EAI draft'));
  fireEvent.click(
    screen.getByLabelText(/I agree to send the document details/),
  );
  fireEvent.click(screen.getByRole('radio', { name: /Direct deposit form/ }));
  expect(screen.queryByLabelText('Use an EAI draft')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText(/I agree to send the document details/),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() =>
    expect(generateDocument).toHaveBeenCalledWith(
      'deposit',
      expect.any(Object),
      undefined,
    ),
  );
  expect(draftAi).not.toHaveBeenCalled();
});

it('cannot generate an Employer-only template remembered in the shared draft when viewing Employee forms', async () => {
  profile = { ...EXAMPLE_PROFILE };
  function SwitchForms(): React.ReactNode {
    const [role, setRole] = useState<WorkspaceRole>('admin');
    return (
      <>
        <button onClick={() => setRole('employee')}>View employee forms</button>
        <ResourcesWorkspace
          role={role}
          onChangeRole={jest.fn()}
          onBack={jest.fn()}
          preview
          runtime={runtime}
        />
      </>
    );
  }
  render(
    <SessionDraftProvider>
      <Seed />
      <SwitchForms />
    </SessionDraftProvider>,
  );
  fireEvent.click(screen.getByRole('radio', { name: /Welcome email/ }));
  fireEvent.click(screen.getByRole('button', { name: 'View employee forms' }));
  expect(
    screen.queryByRole('radio', { name: /Welcome email/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.getByRole('radio', { name: /Onboarding checklist/ }),
  ).toBeChecked();
  fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
  await waitFor(() =>
    expect(generateDocument).toHaveBeenCalledWith(
      'checklist',
      expect.any(Object),
      undefined,
    ),
  );
  expect(generateDocument).toHaveBeenCalledTimes(1);
});

it.each(['checklist', 'welcome', 'it'] as const)(
  'creates %s from the shared profile rather than a second details form',
  async (kind) => {
    profile = { ...EXAMPLE_PROFILE };
    begin(kind === 'checklist' ? 'employee' : 'admin');
    const labels = {
      checklist: /Onboarding checklist/,
      welcome: /Welcome email/,
      it: /IT setup sheet/,
    };
    fireEvent.click(screen.getByRole('radio', { name: labels[kind] }));
    fireEvent.click(screen.getByRole('button', { name: 'Download PDF' }));
    await waitFor(() =>
      expect(generateDocument).toHaveBeenCalledWith(
        kind,
        expect.objectContaining({
          name: EXAMPLE_PROFILE.legalName,
          department: EXAMPLE_PROFILE.department,
          temporaryPassword: '',
        }),
        undefined,
      ),
    );
    expect(draftAi).not.toHaveBeenCalled();
  },
);

it('reports specific incomplete fields and downloads a timestamped report without completing onboarding', async () => {
  read.mockResolvedValue(
    'Hire date: 2026-10-12\nEmployee signature: Alex Morgan',
  );
  begin();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open checklist checker' }),
  );
  const file = new File(['check'], 'checklist.txt', { type: 'text/plain' });
  fireEvent.change(screen.getByLabelText('Completed checklist or form'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check checklist' }));
  await screen.findByText('Some fields need attention');
  expect(
    screen.getByText('Provide the approving manager’s name.'),
  ).toBeInTheDocument();
  expect(screen.getByText(/does not verify identity/)).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Download checked PDF' }));
  await waitFor(() =>
    expect(generateCheckedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ passed: false, checkedAt: expect.any(String) }),
      file,
    ),
  );
  expect(reviewAi).not.toHaveBeenCalled();
});

it('shows unreadable file errors and removes stale check results when the file is replaced', async () => {
  read
    .mockResolvedValueOnce('Hire date: 2026-10-12')
    .mockRejectedValueOnce(
      new Error('This PDF has no readable text. Upload a text-based PDF.'),
    );
  begin();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open checklist checker' }),
  );
  const input = screen.getByLabelText('Completed checklist or form');
  fireEvent.change(input, {
    target: { files: [new File(['text'], 'first.txt')] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check checklist' }));
  await screen.findByText('Some fields need attention');
  fireEvent.change(input, {
    target: { files: [new File(['scan'], 'second.pdf')] },
  });
  expect(
    screen.queryByRole('button', { name: 'Download checked PDF' }),
  ).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Check checklist' }));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'no readable text',
  );
});

it('retains the selected file, check result and template details when leaving and reopening resources', async () => {
  profile = { ...EXAMPLE_PROFILE };
  read.mockResolvedValue('Hire date: 2026-10-12');
  begin('admin');
  fireEvent.click(screen.getByRole('radio', { name: /IT setup sheet/ }));
  fireEvent.change(screen.getByLabelText('Assigned login (optional)'), {
    target: { value: 'alex.account' },
  });
  fireEvent.change(screen.getByLabelText('Assigned equipment (optional)'), {
    target: { value: 'Laptop asset 100' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Open checklist checker' }),
  );
  const file = new File(['text'], 'retained-checklist.txt');
  fireEvent.change(screen.getByLabelText('Completed checklist or form'), {
    target: { files: [file] },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Check checklist' }));
  await screen.findByText('Some fields need attention');
  fireEvent.click(screen.getByRole('button', { name: 'Back to Settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Reopen resources' }));
  expect(screen.getByText('Some fields need attention')).toBeInTheDocument();
  expect(screen.getByText(file.name)).toBeInTheDocument();
  expect(currentDraft.resources.file).toBe(file);
  fireEvent.click(screen.getByRole('button', { name: 'Download checked PDF' }));
  await waitFor(() =>
    expect(generateCheckedDocument).toHaveBeenCalledWith(
      expect.objectContaining({ filename: file.name }),
      file,
    ),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Forms page' }));
  expect(screen.getByRole('radio', { name: /IT setup sheet/ })).toBeChecked();
  expect(screen.getByLabelText('Assigned login (optional)')).toHaveValue(
    'alex.account',
  );
  expect(screen.getByLabelText('Assigned equipment (optional)')).toHaveValue(
    'Laptop asset 100',
  );
});
