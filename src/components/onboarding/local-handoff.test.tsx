import { useState } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { EmployeeWorkspace } from './employee-workspace';
import { RoleWorkspace } from './role-workspace';
import {
  SessionDraftProvider,
  useSessionDraft,
  type SessionDraft,
} from './session-draft';
import { submitIdentityDocument } from '@/lib/onboarding/content-understanding';
import { generateSalaryConfirmation } from '@/lib/onboarding/files';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: 'test-user', name: 'Reviewer' } },
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./identity-document-review', () => ({
  IdentityDocumentReview: ({ file }: { file: File }) => (
    <p>Original document: {file.name}</p>
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
let current: SessionDraft;
function Views(): React.ReactNode {
  const [role, setRole] = useState<'admin' | 'employee'>('admin');
  current = useSessionDraft().draft;
  return (
    <>
      <button onClick={() => setRole('admin')}>Test switch employer</button>
      <button onClick={() => setRole('employee')}>Test switch employee</button>
      {role === 'admin' ? (
        <RoleWorkspace
          role='admin'
          preview
          onChangeRole={jest.fn()}
          onPreviewEmployee={() => setRole('employee')}
        />
      ) : (
        <EmployeeWorkspace
          preview
          onConnection={jest.fn()}
          onPrepareHire={() => setRole('admin')}
        />
      )}
    </>
  );
}
beforeEach(() => {
  jest.clearAllMocks();
  jest
    .mocked(generateSalaryConfirmation)
    .mockResolvedValue(new Uint8Array([1, 2, 3]));
  jest.mocked(submitIdentityDocument).mockResolvedValue({
    jobId: 'sample',
    status: 'review',
    scope: 'extraction',
    fields: [{ name: 'Licence number', value: 'SAMPLE-123' }],
    text: 'Licence number: SAMPLE-123',
    message: 'Review extracted details',
  });
  Object.defineProperty(global, 'fetch', {
    value: jest.fn(async () => ({
      ok: true,
      json: async () => ({
        configured: true,
        documents: {
          configured: true,
          mode: 'direct',
          tenantId: 'test',
          appKey: 'firstday',
          workflowKey: 'onboarding',
        },
      }),
    })),
    writable: true,
  });
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
  Object.defineProperty(global.crypto, 'randomUUID', {
    value: () => 'test-salary',
    configurable: true,
  });
});
function setup(): void {
  render(
    <SessionDraftProvider>
      <Views />
    </SessionDraftProvider>,
  );
}
function prepare(): void {
  fireEvent.click(
    within(screen.getByRole('main')).getByRole('button', {
      name: 'Hire details',
    }),
  );
  Object.entries({
    'Employee legal name': 'Alex Morgan',
    'Employee email': 'alex@example.com',
    Department: 'Finance',
    'Job title': 'Analyst',
    Manager: 'Jordan Lee',
    'Start date': '2026-11-01',
  }).forEach(([label, value]) =>
    fireEvent.change(screen.getByLabelText(label), { target: { value } }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save hire details' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pay terms' }));
  fireEvent.change(screen.getByLabelText('Employer name'), {
    target: { value: 'Local company' },
  });
  fireEvent.change(screen.getByLabelText('Gross pay amount'), {
    target: { value: '92000' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save prepared offer' }));
  fireEvent.click(screen.getByRole('button', { name: 'Employees' }));
  fireEvent.click(screen.getByLabelText(/Work email and system access/));
  fireEvent.click(screen.getByLabelText(/Equipment ready for collection/));
  fireEvent.click(screen.getByRole('button', { name: 'Open employee view' }));
  fireEvent.click(screen.getByLabelText(/Complete your induction/));
  fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
}
function personalDetails(): void {
  Object.entries({
    'Mobile number': '0400000000',
    'Date of birth': '1995-06-15',
    'Street address': '10 Example Street',
    'City / suburb': 'Sydney',
    Postcode: '2000',
    'Contact name': 'Jamie Morgan',
    Relationship: 'Sibling',
    'Contact phone': '0400000001',
  }).forEach(([label, value]) =>
    fireEvent.change(screen.getByLabelText(new RegExp(`^${label}`)), {
      target: { value },
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Save details' }));
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
}
async function extractAndReview(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'My documents' }));
  if (!current.identity)
    fireEvent.change(screen.getByLabelText('Identity document'), {
      target: {
        files: [
          new File(['SAMPLE ONLY'], 'licence.png', { type: 'image/png' }),
        ],
      },
    });
  const uploadConsent = await screen.findByLabelText(
    /I agree to send this document/,
  );
  if (!(uploadConsent as HTMLInputElement).checked)
    fireEvent.click(uploadConsent);
  fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
  fireEvent.click(
    await screen.findByLabelText(/I compared the extracted fields/),
  );
}
async function createSalary(): Promise<void> {
  fireEvent.click(screen.getByRole('button', { name: 'Salary confirmation' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Create salary confirmation' }),
  );
  await screen.findByLabelText('Salary confirmation preview');
}
async function signSalary(): Promise<void> {
  fireEvent.change(screen.getByLabelText('Signature full legal name'), {
    target: { value: 'Alex Morgan' },
  });
  fireEvent.click(
    screen.getByLabelText(/I have reviewed the employment and salary details/),
  );
  fireEvent.click(
    screen.getByRole('button', { name: 'Sign salary confirmation' }),
  );
  await screen.findByText('Signed by Alex Morgan');
}

describe('Shared session employer and employee journey', () => {
  it('hands a newly created saved case to an employee with known details and first-day guidance', async () => {
    setup();
    fireEvent.click(screen.getByRole('button', { name: 'Add employee' }));
    Object.entries({
      'Employee name': 'Alex Morgan',
      'Employee email': 'alex@example.com',
      Department: 'Finance',
      'Job title': 'Analyst',
      Manager: 'Jordan Lee',
      'Start date': '2026-11-01',
      Company: 'Local company',
      'Annual salary (AUD)': '92000',
      'Arrival and contact details': 'Meet Jordan at reception at 9am.',
    }).forEach(([label, value]) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Create employee record' }),
    );
    fireEvent.click(screen.getByLabelText(/Work email and system access/));
    fireEvent.click(screen.getByLabelText(/Equipment ready for collection/));
    fireEvent.click(screen.getByRole('button', { name: 'Open employee view' }));
    expect(
      screen.getByText('Meet Jordan at reception at 9am.'),
    ).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText(/Complete your induction/));
    fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
    expect(screen.getByLabelText(/Full legal name/)).toHaveValue('Alex Morgan');
    expect(screen.getByLabelText(/Mobile number/)).toHaveValue('');
    expect(current.profile.role).toBe('Analyst');
    expect(current.profile.birthDate).toBe('');
    personalDetails();
    await extractAndReview();
    await createSalary();
    await signSalary();
    expect(screen.getByText('Ready for employer review')).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open onboarding review' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    fireEvent.click(
      screen.getByLabelText(
        'I have reviewed these details for this local walkthrough.',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    );
    expect(current.employerReviewed).toBe(true);
    expect(
      current.activity?.find(
        (entry) => entry.action === 'Employer recorded completion review',
      ),
    ).toMatchObject({ actor: 'Reviewer', at: expect.any(String) });
  });
  it('prepares, extracts, signs, resolves a correction and acknowledges local completion across roles', async () => {
    setup();
    prepare();
    personalDetails();
    await extractAndReview();
    await createSalary();
    await signSalary();
    expect(current.terms.amount).toBe('92000');
    expect(current.document?.signature?.name).toBe('Alex Morgan');
    fireEvent.click(
      screen.getByRole('button', { name: 'Open onboarding review' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    expect(
      screen.getByText('Original document: licence.png'),
    ).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Correction needed'), {
      target: { value: 'Please check the licence number again.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }));
    expect(current.document).toBeNull();
    expect(current.reviewed).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Open employee view' }));
    expect(
      screen.getByText('Please check the licence number again.'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Mark correction addressed' }),
    ).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'My profile' }));
    await extractAndReview();
    fireEvent.click(
      screen.getByRole('button', { name: 'Mark correction addressed' }),
    );
    expect(current.correction).toBe('');
    await createSalary();
    await signSalary();
    fireEvent.click(
      screen.getByRole('button', { name: 'Open onboarding review' }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    fireEvent.click(
      screen.getByLabelText(
        'I have reviewed these details for this local walkthrough.',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    );
    expect(current.employerReviewed).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open employee view' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Salary confirmation' }),
    );
    await act(async () => {});
    expect(screen.getByText('Demo onboarding complete')).toBeInTheDocument();
  });
  it('example personal data preserves employer-prepared role and pay terms', async () => {
    setup();
    prepare();
    fireEvent.click(
      screen.getByRole('button', { name: 'Use example details' }),
    );
    expect(current.terms.amount).toBe('92000');
    expect(current.terms.company).toBe('Local company');
    expect(current.profile.role).toBe('Analyst');
    expect(current.profile.department).toBe('Finance');
    expect(current.profile.manager).toBe('Jordan Lee');
    expect(current.profile.startDate).toBe('2026-11-01');
    await act(async () => {});
  });
  it('ignores a late extraction result after switching away from the employee view', async () => {
    let resolve!: (
      value: Awaited<ReturnType<typeof submitIdentityDocument>>,
    ) => void;
    jest.mocked(submitIdentityDocument).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    setup();
    prepare();
    personalDetails();
    fireEvent.change(screen.getByLabelText('Identity document'), {
      target: {
        files: [new File(['SAMPLE'], 'licence.png', { type: 'image/png' })],
      },
    });
    fireEvent.click(
      await screen.findByLabelText(/I agree to send this document/),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Read document' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Test switch employer' }),
    );
    await act(async () => {
      resolve({
        jobId: 'stale',
        status: 'review',
        text: 'stale extraction',
        message: 'Done',
      });
    });
    expect(current.analysis).toBeNull();
    expect(current.reviewed).toBe(false);
  });
  it('does not resurrect a signed document when employer terms change during PDF generation', async () => {
    setup();
    prepare();
    personalDetails();
    await extractAndReview();
    await createSalary();
    let resolve!: (value: Uint8Array) => void;
    jest.mocked(generateSalaryConfirmation).mockImplementationOnce(
      () =>
        new Promise((done) => {
          resolve = done;
        }),
    );
    fireEvent.change(screen.getByLabelText('Signature full legal name'), {
      target: { value: 'Alex Morgan' },
    });
    fireEvent.click(
      screen.getByLabelText(
        /I have reviewed the employment and salary details/,
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Sign salary confirmation' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Test switch employer' }),
    );
    fireEvent.click(
      within(
        screen.getByRole('navigation', { name: 'admin navigation' }),
      ).getByRole('button', { name: 'Pay terms' }),
    );
    fireEvent.change(screen.getByLabelText('Gross pay amount'), {
      target: { value: '95000' },
    });
    await act(async () => {
      resolve(new Uint8Array([1, 2, 3]));
    });
    await waitFor(() => expect(current.document).toBeNull());
    expect(current.terms.amount).toBe('95000');
    expect(current.employerReviewed).toBe(false);
  });
});
