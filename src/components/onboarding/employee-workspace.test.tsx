import { useEffect } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { EmployeeWorkspace } from './employee-workspace';
import {
  SessionDraftProvider,
  useSessionDraft,
  emptySessionDraft,
  type SessionDraft,
} from './session-draft';
import {
  submitIdentityDocument,
  refreshIdentityDocument,
  validateIdentityFile,
} from '@/lib/onboarding/content-understanding';
import { generateSalaryConfirmation } from '@/lib/onboarding/files';
import {
  EXAMPLE_PROFILE,
  EXAMPLE_TERMS,
} from '@/lib/onboarding/employee-workflow';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: 'employee-1' } },
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./identity-document-review', () => ({
  IdentityDocumentReview: ({ file }: { file: File }) => (
    <p>Preview: {file.name}</p>
  ),
}));
jest.mock('@/lib/onboarding/files', () => ({
  generateSalaryConfirmation: jest.fn(async () => new Uint8Array([1, 2, 3])),
  downloadPdf: jest.fn(),
}));
jest.mock('@/lib/onboarding/content-understanding', () => ({
  identityFindings: jest.fn(() => []),
  submitIdentityDocument: jest.fn(),
  refreshIdentityDocument: jest.fn(),
  validateIdentityFile: jest.fn(),
}));
const submitted = jest.mocked(submitIdentityDocument);
const refreshed = jest.mocked(refreshIdentityDocument);
let current: SessionDraft;
function Seed({ seed }: { seed: Partial<SessionDraft> }) {
  const { draft, setDraft } = useSessionDraft();
  useEffect(() => {
    setDraft({ ...emptySessionDraft(), ...seed });
  }, [seed, setDraft]);
  current = draft;
  return null;
}
function mount(seed: Partial<SessionDraft> = {}, configRevision = 0) {
  return render(
    <SessionDraftProvider>
      <Seed seed={seed} />
      <EmployeeWorkspace
        preview
        configRevision={configRevision}
        onConnection={jest.fn()}
      />
    </SessionDraftProvider>,
  );
}
const offer = () => ({
  profile: { ...EXAMPLE_PROFILE },
  terms: { ...EXAMPLE_TERMS },
  offerPrepared: true,
});
beforeEach(() => {
  jest.clearAllMocks();
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
  Object.defineProperty(global, 'fetch', {
    value: jest.fn(async () => ({
      ok: true,
      json: async () => ({
        documents: {
          configured: true,
          mode: 'direct',
          tenantId: 'test',
          appKey: 'test',
          workflowKey: 'onboarding',
        },
      }),
    })),
    writable: true,
  });
  Object.defineProperty(global.crypto, 'randomUUID', {
    value: () => 'test-document',
    configurable: true,
  });
});
async function begin() {
  mount(offer());
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: {
      files: [
        new File(['SAMPLE ONLY'], 'licence.pdf', { type: 'application/pdf' }),
      ],
    },
  });
  fireEvent.click(
    await screen.findByLabelText(/I agree to send this document/),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
}

it('extracts fields, requires human review, signs read-only employer terms, and awaits employer acknowledgement', async () => {
  submitted.mockResolvedValue({
    jobId: 'test',
    status: 'review',
    scope: 'extraction',
    text: '',
    message: 'Extracted',
    fields: [{ name: 'Licence Number', value: 'SAMPLE123', confidence: 0.99 }],
  });
  await begin();
  expect(current.reviewed).toBe(false);
  fireEvent.click(
    await screen.findByLabelText(/I compared the extracted fields/),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Salary confirmation' }));
  expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  expect(
    screen.queryByLabelText('Gross salary / pay amount'),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Create salary confirmation' }),
  );
  await screen.findByLabelText('Salary confirmation preview');
  fireEvent.change(screen.getByLabelText('Signature full legal name'), {
    target: { value: EXAMPLE_PROFILE.legalName },
  });
  fireEvent.click(screen.getByLabelText(/I have reviewed the employment/));
  fireEvent.click(
    screen.getByRole('button', { name: 'Sign salary confirmation' }),
  );
  await screen.findByText('Signed by Alex Morgan');
  expect(current.document?.signature?.name).toBe(EXAMPLE_PROFILE.legalName);
  expect(current.employerReviewed).toBe(false);
  expect(screen.getByText('Ready for employer review')).toBeInTheDocument();
  expect(generateSalaryConfirmation).toHaveBeenLastCalledWith(
    expect.objectContaining({
      terms: EXAMPLE_TERMS,
      signature: expect.objectContaining({ name: 'Alex Morgan' }),
    }),
  );
});
it('does not treat failed extraction as review or completion', async () => {
  submitted.mockRejectedValue(new Error('EAI unavailable'));
  await begin();
  expect(await screen.findByText('EAI unavailable')).toHaveFocus();
  expect(current.reviewed).toBe(false);
  expect(current.reviewed).toBe(false);
});
it('supports canonical queued processing and only enables review after returned evidence', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({
      documents: {
        configured: true,
        tenantId: 'test',
        appKey: 'test',
        workflowKey: 'onboarding',
      },
    }),
  } as Response);
  submitted.mockResolvedValue({
    jobId: 'queued',
    status: 'processing',
    text: '',
    message: 'Queued',
  });
  refreshed.mockResolvedValue({
    jobId: 'queued',
    status: 'review',
    text: 'Passport: Alex Morgan',
    message: 'Review',
  });
  mount(offer());
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: {
      files: [
        new File(['sample'], 'passport.pdf', { type: 'application/pdf' }),
      ],
    },
  });
  fireEvent.click(await screen.findByLabelText(/I agree to send/));
  fireEvent.click(screen.getByRole('button', { name: 'Submit for checking' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Check processing status' }),
  );
  await screen.findByText('Passport: Alex Morgan');
  expect(screen.getByLabelText(/I compared/)).not.toBeChecked();
  expect(current.reviewed).toBe(false);
});
it('highlights missing details and keeps user entries on failed validation', () => {
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
  fireEvent.change(screen.getByLabelText(/Full legal name/), {
    target: { value: 'Test Person' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  expect(screen.getByLabelText(/Personal email/)).toHaveAttribute(
    'aria-invalid',
    'true',
  );
  expect(screen.getByLabelText(/Full legal name/)).toHaveValue('Test Person');
  expect(current.saved).toBe(false);
  expect(screen.getByRole('alert')).toHaveFocus();
});
it('allows local PNG upload before service setup and blocks review after replacing or removing a file', async () => {
  jest.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: async () => ({ documents: { configured: false } }),
  } as Response);
  mount({
    ...offer(),
    saved: true,
    identity: new File(['sample'], 'old.pdf', { type: 'application/pdf' }),
    reviewed: true,
    analysis: {
      jobId: 'old',
      status: 'review',
      scope: 'extraction',
      text: 'Sample',
      message: 'Review',
    },
  });
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  const file = new File(['sample'], 'new.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: { files: [file] },
  });
  expect(validateIdentityFile).toHaveBeenCalledWith(file);
  expect(current.identity).toBe(file);
  expect(current.reviewed).toBe(false);
  expect(current.analysis).toBeNull();
  const list = screen.getByRole('list', { name: 'Documents needed' });
  fireEvent.click(
    within(list).getByRole('button', { name: 'Remove identity document' }),
  );
  expect(current.identity).toBeNull();
  expect(submitted).not.toHaveBeenCalled();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});
it('ignores extraction results arriving after the employee view is unmounted', async () => {
  let finish!: (
    value: Awaited<ReturnType<typeof submitIdentityDocument>>,
  ) => void;
  submitted.mockImplementation(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const view = mount(offer());
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: {
      files: [new File(['sample'], 'licence.pdf', { type: 'application/pdf' })],
    },
  });
  fireEvent.click(await screen.findByLabelText(/I agree to send/));
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  view.rerender(
    <SessionDraftProvider>
      <Seed seed={offer()} />
    </SessionDraftProvider>,
  );
  finish({
    jobId: 'late',
    status: 'review',
    scope: 'extraction',
    text: 'late',
    message: 'late',
  });
  await waitFor(() => expect(current.analysis).toBeNull());
});

it('recovers document configuration without losing the chosen file', async () => {
  jest
    .mocked(global.fetch)
    .mockRejectedValueOnce(new Error('Offline'))
    .mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        documents: {
          configured: true,
          mode: 'direct',
          tenantId: 'test',
          appKey: 'test',
          workflowKey: 'onboarding',
        },
      }),
    } as Response);
  mount();
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  const file = new File(['sample'], 'sample.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: { files: [file] },
  });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Retry document configuration' }),
  );
  await screen.findByLabelText(/I agree to send/);
  expect(current.identity).toBe(file);
  expect(screen.getByRole('button', { name: 'Read document' })).toBeDisabled();
});

it('opens independent task pages from Home and sidebar without a workflow stepper', async () => {
  mount();
  expect(
    screen.getByRole('heading', { name: 'Your onboarding details' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Forms' }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Check AI connection/ }),
  ).not.toBeInTheDocument();
  expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('navigation', { name: /onboarding steps/ }),
  ).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Continue onboarding/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Open Review and sign your pay terms' }),
  );
  expect(
    screen.getByRole('heading', { level: 1, name: 'Salary confirmation' }),
  ).toHaveFocus();
  expect(
    screen.getByText('Waiting for your employment terms'),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Home' }));
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Open Upload and review your document',
    }),
  );
  expect(screen.getByLabelText('Identity document')).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
  expect(screen.getByLabelText(/Full legal name/)).toBeInTheDocument();
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

it('reloads document setup when help refreshes settings without removing the selected file', async () => {
  jest.mocked(global.fetch).mockResolvedValueOnce({
    ok: true,
    json: async () => ({ documents: { configured: false } }),
  } as Response);
  const seed = offer();
  const view = mount(seed);
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  const file = new File(['sample'], 'selected.png', { type: 'image/png' });
  fireEvent.change(screen.getByLabelText('Identity document'), {
    target: { files: [file] },
  });
  await screen.findByText('Document reading needs setup.');
  view.rerender(
    <SessionDraftProvider>
      <Seed seed={seed} />
      <EmployeeWorkspace preview configRevision={1} onConnection={jest.fn()} />
    </SessionDraftProvider>,
  );
  await screen.findByLabelText(/I agree to send this document/);
  expect(current.identity).toBe(file);
  expect(global.fetch).toHaveBeenCalledTimes(2);
});
