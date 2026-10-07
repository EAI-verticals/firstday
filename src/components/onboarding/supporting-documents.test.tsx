import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { SupportingDocuments } from './supporting-documents';
import {
  SessionDraftProvider,
  useSessionDraft,
  type SessionDraft,
} from './session-draft';
import { SUPPORTING_DOCUMENT_TYPES } from '@/lib/onboarding/document-catalog';
import {
  submitSupportingDocument,
  type ContentRuntime,
  type DocumentAnalysis,
} from '@/lib/onboarding/content-understanding';

let authStatus = 'authenticated';
let current: SessionDraft;
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: authStatus,
    data: { user: { id: 'supporting-user' } },
  }),
  signIn: jest.fn(),
}));
jest.mock('@/lib/onboarding/content-understanding', () => ({
  ...jest.requireActual('@/lib/onboarding/content-understanding'),
  submitSupportingDocument: jest.fn(),
}));
jest.mock('./identity-document-review', () => ({
  IdentityDocumentReview: ({
    file,
    analysis,
    purpose,
  }: {
    file: File;
    analysis: DocumentAnalysis | null;
    purpose: string;
  }) => (
    <div>
      <p>
        Preview {file.name} for {purpose}
      </p>
      {analysis?.fields?.map((field) => (
        <p key={field.name}>
          {field.name}: {field.value}
        </p>
      ))}
    </div>
  ),
}));
const submit = jest.mocked(submitSupportingDocument);
const runtime: ContentRuntime = {
  tenantId: 'tenant',
  appKey: 'app',
  workflowKey: 'onboarding',
  mode: 'direct',
  configured: true,
};
function Snapshot(): null {
  current = useSessionDraft().draft;
  return null;
}
function Walkthrough({
  config,
}: {
  config: ContentRuntime | null;
}): React.ReactNode {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(!open)}>
        {open ? 'Leave documents' : 'Return to documents'}
      </button>
      {open && (
        <SupportingDocuments runtime={config} onConnection={jest.fn()} />
      )}
    </>
  );
}
function begin(
  config: ContentRuntime | null = runtime,
): ReturnType<typeof render> {
  return render(
    <SessionDraftProvider>
      <Snapshot />
      <Walkthrough config={config} />
    </SessionDraftProvider>,
  );
}
function add(
  name: string,
  fileName = 'sample.pdf',
  type = 'application/pdf',
): File {
  const file = new File(['SAMPLE ONLY'], fileName, { type });
  fireEvent.change(screen.getByLabelText(`${name} file`), {
    target: { files: [file] },
  });
  return file;
}
function agree(): void {
  fireEvent.click(screen.getByRole('checkbox', { name: /I agree to send/ }));
}
function result(value = 'Alex Morgan'): DocumentAnalysis {
  return {
    jobId: 'job',
    status: 'review',
    text: 'Real returned fields',
    message: 'Review extracted details',
    scope: 'extraction',
    fields: [
      { name: 'Employee Name', value },
      { name: 'Signature Present', value: 'false' },
    ],
  };
}
beforeEach(() => {
  jest.clearAllMocks();
  authStatus = 'authenticated';
});

it.each([
  {
    status: 'review' as const,
    text: 'OCR text without Admin fields',
    issue: 'No extracted fields were returned',
  },
  {
    status: 'processing' as const,
    text: '',
    issue: 'did not return a final result',
  },
])(
  'rejects $status responses without final typed fields',
  async ({ status, text, issue }) => {
    submit.mockResolvedValue({
      jobId: 'job',
      status,
      text,
      message: 'Not final evidence',
      scope: 'extraction',
    });
    begin();
    add('Visa evidence');
    agree();
    fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
    expect(await screen.findByRole('alert')).toHaveTextContent(issue);
    expect(screen.getByText('Needs attention')).toBeInTheDocument();
    expect(screen.queryByText('Details ready')).not.toBeInTheDocument();
    expect(current.supportingDocuments['visa-evidence']?.analysis).toBeNull();
  },
);

it('offers exactly eight separate upload controls without changing identity or salary progress', () => {
  begin();
  for (const type of SUPPORTING_DOCUMENT_TYPES)
    expect(
      screen.getByRole('button', { name: `Upload ${type.name}` }),
    ).toBeInTheDocument();
  expect(screen.getAllByText('Not added')).toHaveLength(8);
  add('Signed employment agreement');
  expect(current.supportingDocuments['employment-agreement']?.file.name).toBe(
    'sample.pdf',
  );
  expect(current.reviewed).toBe(false);
  expect(current.identity).toBeNull();
  expect(current.document).toBeNull();
  expect(submit).not.toHaveBeenCalled();
});

it('requires consent and forwards the selected Admin document type with its file', async () => {
  submit.mockResolvedValue(result());
  begin();
  const file = add('TFN declaration');
  expect(screen.getByRole('button', { name: 'Read document' })).toBeDisabled();
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  expect(await screen.findByText('Details ready')).toBeInTheDocument();
  expect(submit).toHaveBeenCalledWith(file, runtime, 'tfn-declaration');
  expect(screen.getByText('Signature Present: false')).toBeInTheDocument();
  expect(screen.queryByText('Passed')).not.toBeInTheDocument();
});

it('blocks signed-out extraction and disconnected or non-direct configuration', () => {
  authStatus = 'unauthenticated';
  const view = begin();
  add('Visa evidence');
  agree();
  expect(
    screen.getByRole('button', { name: 'Sign in with EAI' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read document' })).toBeDisabled();
  view.unmount();
  authStatus = 'authenticated';
  begin({ ...runtime, mode: undefined });
  add('Visa evidence');
  agree();
  expect(
    screen.getByRole('button', { name: 'Get help' }),
  ).toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Read document' })).toBeDisabled();
  expect(submit).not.toHaveBeenCalled();
});

it('rejects unsupported files while keeping a previously selected valid file', () => {
  begin();
  const valid = add('Bank details form');
  add(
    'Bank details form',
    'invalid.docx',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Choose a PDF, JPG or PNG',
  );
  expect(current.supportingDocuments['bank-details']?.file).toBe(valid);
  expect(submit).not.toHaveBeenCalled();
});

it('keeps results independent and resets only the replaced or removed document', async () => {
  submit
    .mockResolvedValueOnce(result('Agreement employee'))
    .mockResolvedValueOnce(result('Visa holder'));
  begin();
  add('Signed employment agreement', 'agreement.pdf');
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  await screen.findByText('Employee Name: Agreement employee');
  add('Visa evidence', 'visa.png', 'image/png');
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  await screen.findByText('Employee Name: Visa holder');
  expect(
    current.supportingDocuments['employment-agreement']?.analysis?.fields?.[0]
      .value,
  ).toBe('Agreement employee');
  add('Visa evidence', 'replacement.png', 'image/png');
  expect(current.supportingDocuments['visa-evidence']?.analysis).toBeNull();
  expect(current.supportingDocuments['visa-evidence']?.consent).toBe(false);
  expect(
    current.supportingDocuments['employment-agreement']?.analysis,
  ).not.toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Remove Visa evidence' }));
  expect(current.supportingDocuments['visa-evidence']).toBeUndefined();
  expect(current.supportingDocuments['employment-agreement']?.file.name).toBe(
    'agreement.pdf',
  );
});

it('retains a failed file for retry and prevents overlapping submissions', async () => {
  let reject: ((error: Error) => void) | undefined;
  submit
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, rejectRequest) => {
          reject = rejectRequest;
        }),
    )
    .mockResolvedValueOnce(result());
  begin();
  const file = add('Equipment acknowledgement');
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  expect(
    screen.getByRole('button', { name: 'Upload Visa evidence' }),
  ).toBeDisabled();
  await act(async () => {
    reject?.(new Error('The document service is unavailable. Try again.'));
  });
  expect(screen.getByRole('alert')).toHaveTextContent(
    'document service is unavailable',
  );
  expect(current.supportingDocuments['equipment-acknowledgement']?.file).toBe(
    file,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Try again' }));
  await screen.findByText('Details ready');
  expect(submit).toHaveBeenCalledTimes(2);
});

it('ignores responses that arrive after replacement or after leaving the view', async () => {
  let finish: ((value: DocumentAnalysis) => void) | undefined;
  submit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  begin();
  add('Policy acknowledgement');
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  // A programmatic event also exercises the guard behind disabled native controls.
  add('Policy acknowledgement', 'new-policy.pdf');
  await act(async () => {
    finish?.(result('Old response'));
  });
  expect(current.supportingDocuments['policy-acknowledgement']?.file.name).toBe(
    'new-policy.pdf',
  );
  expect(
    current.supportingDocuments['policy-acknowledgement']?.analysis,
  ).toBeNull();
  submit.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  fireEvent.click(screen.getByRole('button', { name: 'Leave documents' }));
  await act(async () => {
    finish?.(result('Unmounted response'));
  });
  expect(
    current.supportingDocuments['policy-acknowledgement']?.analysis,
  ).toBeNull();
});

it('preserves each file and extracted result across navigation without automatically submitting again', async () => {
  submit.mockResolvedValue(result());
  begin();
  const file = add('Superannuation choice form');
  agree();
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  await screen.findByText('Details ready');
  fireEvent.click(screen.getByRole('button', { name: 'Leave documents' }));
  fireEvent.click(screen.getByRole('button', { name: 'Return to documents' }));
  expect(screen.getByText('Details ready')).toBeInTheDocument();
  expect(current.supportingDocuments['superannuation-choice']?.file).toBe(file);
  fireEvent.click(
    screen.getByRole('button', { name: 'View Superannuation choice form' }),
  );
  expect(screen.getByText('Employee Name: Alex Morgan')).toBeInTheDocument();
  await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
});
