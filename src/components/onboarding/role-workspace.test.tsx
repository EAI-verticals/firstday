import { useState } from 'react';
import {
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { RoleWorkspace } from './role-workspace';
import type { CompanyPolicy } from '@/lib/onboarding/cases';
import { emptySessionDraft, type SessionDraft } from './session-draft';
import {
  EXAMPLE_PROFILE,
  EXAMPLE_TERMS,
} from '@/lib/onboarding/employee-workflow';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { name: 'Test reviewer' } },
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./identity-document-review', () => ({
  IdentityDocumentReview: ({ file }: { file: File }) => (
    <p>Original document: {file.name}</p>
  ),
}));
let mockPolicies: CompanyPolicy[] = [];
let mockSeed: SessionDraft;
let mockCurrent: SessionDraft;
function useMockStore(): ReturnType<
  typeof import('./session-draft').useSessionDraft
> {
  const [draft, setDraft] = useState(mockSeed);
  mockCurrent = draft;
  return {
    draft,
    setDraft,
    policies: mockPolicies,
    records: [],
    saveStatus: '',
    recordNotice: '',
    createCase: jest.fn(),
    selectCase: jest.fn(),
    addPolicy: jest.fn(),
  };
}
jest.mock('./session-draft', () => {
  const actual = jest.requireActual('./session-draft');
  return { ...actual, useSessionDraft: () => useMockStore() };
});
beforeEach(() => {
  mockPolicies = [];
  mockSeed = emptySessionDraft();
  jest.clearAllMocks();
  Object.defineProperty(global, 'fetch', {
    value: jest.fn(async () => ({
      ok: true,
      json: async () => ({ configured: true, documents: { configured: true } }),
    })),
    writable: true,
  });
});
function completeDraft(): SessionDraft {
  return {
    ...emptySessionDraft(),
    identity: new File(['SAMPLE'], 'sample-licence.pdf', {
      type: 'application/pdf',
    }),
    profile: { ...EXAMPLE_PROFILE },
    terms: { ...EXAMPLE_TERMS },
    offerPrepared: true,
    saved: true,
    reviewed: true,
    analysis: {
      jobId: 'sample',
      status: 'review',
      text: 'Licence number 123',
      message: 'Ready',
    },
    document: {
      id: 'salary',
      createdAt: '2026-10-06T00:00:00Z',
      profile: { ...EXAMPLE_PROFILE },
      terms: { ...EXAMPLE_TERMS },
      signature: {
        name: EXAMPLE_PROFILE.legalName,
        signedAt: '2026-10-06T00:01:00Z',
        consent: 'Accepted',
      },
    },
  };
}
function admin(): { employee: jest.Mock } {
  const employee = jest.fn();
  render(
    <RoleWorkspace
      role='admin'
      preview
      onChangeRole={jest.fn()}
      onPreviewEmployee={employee}
    />,
  );
  return { employee };
}
describe('Admin local preparation and review', () => {
  it('validates independently accessible hire and pay pages before handoff', () => {
    const { employee } = admin();
    expect(
      screen.queryByRole('button', { name: 'Open employee view' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Pay terms',
      }),
    );
    expect(
      screen.queryByRole('list', { name: 'Offer preparation stages' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Continue' }),
    ).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Employer name'), {
      target: { value: 'Example company' },
    });
    fireEvent.change(screen.getByLabelText('Gross pay amount'), {
      target: { value: '85000' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save prepared offer' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Employee legal name is required.',
    );
    expect(mockCurrent.offerPrepared).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Go to hire details' }));
    fireEvent.click(screen.getByRole('button', { name: 'Save hire details' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Employee legal name is required.',
    );
    const values = {
      'Employee legal name': 'Alex Morgan',
      'Employee email': 'alex@example.com',
      Department: 'Operations',
      'Job title': 'Coordinator',
      Manager: 'Sam Taylor',
      'Start date': '2026-10-12',
    };
    Object.entries(values).forEach(([label, value]) =>
      fireEvent.change(screen.getByLabelText(label), { target: { value } }),
    );
    fireEvent.click(screen.getByRole('button', { name: 'Save hire details' }));
    expect(screen.getByRole('status')).toHaveTextContent('Hire details saved.');
    fireEvent.click(screen.getByRole('button', { name: 'Open pay terms' }));
    expect(screen.getByLabelText('Gross pay amount')).toHaveValue(85000);
    fireEvent.change(screen.getByLabelText('Gross pay amount'), {
      target: { value: '-1' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save prepared offer' }),
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'positive salary amount',
    );
    fireEvent.change(screen.getByLabelText('Gross pay amount'), {
      target: { value: '85000' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Save prepared offer' }),
    );
    expect(mockCurrent.offerPrepared).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Open employee view' }));
    expect(employee).toHaveBeenCalledTimes(1);
  });
  it('invalidates signed pay and completion as soon as employer terms change', () => {
    mockSeed = { ...completeDraft(), employerReviewed: true };
    admin();
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Pay terms',
      }),
    );
    fireEvent.change(screen.getByLabelText('Gross pay amount'), {
      target: { value: '90000' },
    });
    expect(mockCurrent.document).toBeNull();
    expect(mockCurrent.employerReviewed).toBe(false);
    expect(mockCurrent.offerPrepared).toBe(false);
    expect(mockCurrent.reviewed).toBe(true);
  });
  it('invalidates personal and identity review after changing employer basics', () => {
    mockSeed = { ...completeDraft(), employerReviewed: true };
    admin();
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Hire details',
      }),
    );
    fireEvent.change(screen.getByLabelText('Employee legal name'), {
      target: { value: 'Alex Lee' },
    });
    expect(mockCurrent.saved).toBe(false);
    expect(mockCurrent.reviewed).toBe(false);
    expect(mockCurrent.document).toBeNull();
    expect(mockCurrent.employerReviewed).toBe(false);
  });
  it('requires a correction reason and clears stale review and signature', () => {
    mockSeed = completeDraft();
    admin();
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }));
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Describe what the employee needs to correct.',
    );
    fireEvent.change(screen.getByLabelText('Correction needed'), {
      target: { value: 'Please upload the back of the licence.' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Request correction' }));
    expect(mockCurrent.correction).toBe(
      'Please upload the back of the licence.',
    );
    expect(mockCurrent.reviewed).toBe(false);
    expect(mockCurrent.document).toBeNull();
    expect(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    ).toBeDisabled();
  });
  it('gates local completion on all employee prerequisites and explicit review', () => {
    mockSeed = { ...completeDraft(), reviewed: false };
    admin();
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    expect(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    ).toBeDisabled();
    expect(
      screen.getByLabelText(
        'I have reviewed these details for this local walkthrough.',
      ),
    ).toBeDisabled();
  });
  it('lists outstanding assigned tasks and policies instead of allowing early completion', () => {
    mockSeed = {
      ...completeDraft(),
      tasks: [
        {
          id: 't',
          title: 'Collect laptop',
          owner: 'employee',
          dueDate: '2026-11-01',
        },
      ],
    };
    mockPolicies = [
      {
        id: 'p',
        title: 'Safety policy',
        version: '2',
        file: new File(['policy'], 'policy.pdf', { type: 'application/pdf' }),
      },
    ];
    admin();
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    expect(screen.getByText('Collect laptop (employee)')).toBeInTheDocument();
    expect(
      screen.getByText('Acknowledge Safety policy, version 2'),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    ).toBeDisabled();
  });
  it('records only local completion after review, with no live HR claim', () => {
    mockSeed = completeDraft();
    admin();
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    expect(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    ).toBeDisabled();
    fireEvent.click(
      screen.getByLabelText(
        'I have reviewed these details for this local walkthrough.',
      ),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    );
    expect(mockCurrent.employerReviewed).toBe(true);
    expect(
      screen.getByText(/This is not a live HR approval/),
    ).toBeInTheDocument();
  });
  it('rejects a signed snapshot with pay different from the current offer', () => {
    mockSeed = completeDraft();
    mockSeed.terms.amount = '92000';
    admin();
    fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
    expect(
      screen.getByRole('button', { name: 'Acknowledge local completion' }),
    ).toBeDisabled();
  });
  it('keeps local preparation and review unavailable in the real admin workspace', () => {
    const changeRole = jest.fn();
    render(<RoleWorkspace role='admin' onChangeRole={changeRole} />);
    expect(
      screen.getByText('Shared onboarding cases are not connected yet'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Hire details' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Review onboarding' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Acknowledge local completion' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText(/available in the local demo at localhost/),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Choose a demo role' }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      within(screen.getByRole('main')).getByRole('button', {
        name: 'Change role',
      }),
    );
    expect(changeRole).toHaveBeenCalledTimes(1);
  });
});
describe('Admin configuration recovery', () => {
  it('shows loading, retries failure and distinguishes configuration from live health', async () => {
    jest.mocked(global.fetch).mockRejectedValueOnce(new Error('Unavailable'));
    render(<RoleWorkspace role='admin' preview onChangeRole={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    expect(screen.getByRole('status')).toHaveTextContent(
      'Loading service configuration',
    );
    await screen.findByRole('alert');
    expect(screen.queryByText('Configured')).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Retry configuration' }),
    );
    await waitFor(() =>
      expect(screen.getAllByText('Configured')).toHaveLength(2),
    );
    expect(screen.getByText('Not checked on this screen')).toBeInTheDocument();
    expect(global.fetch).toHaveBeenCalledTimes(2);
  });
  it('treats an unreadable successful response as a recoverable error', async () => {
    jest.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => ({ unrelated: true }),
    } as Response);
    render(<RoleWorkspace role='admin' preview onChangeRole={jest.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
    await screen.findByRole('alert');
    expect(
      screen.getByRole('button', { name: 'Retry configuration' }),
    ).toBeEnabled();
  });
});

it('opens Microsoft Entra for role assignment and EAI for knowledge configuration', async () => {
  render(<RoleWorkspace role='admin' preview onChangeRole={jest.fn()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  expect(
    screen.getByRole('link', { name: /Open Microsoft Entra/ }),
  ).toHaveAttribute('href', 'https://entra.microsoft.com/');
  expect(
    screen.getByRole('link', { name: /Open EAI portal for Knowledge base/ }),
  ).toHaveAttribute('href', 'https://admin-portal.myenterprise.ai/');
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});

it('shows supporting evidence in the Admin walkthrough without approving it', () => {
  mockSeed = {
    ...completeDraft(),
    supportingDocuments: {
      'bank-details': {
        file: new File(['synthetic'], 'payroll.png', { type: 'image/png' }),
        consent: true,
        analysis: {
          status: 'review',
          scope: 'extraction',
          jobId: '',
          text: 'BankDetailsPresent: false',
          message: 'Review needed',
          fields: [{ name: 'BankDetailsPresent', value: 'false' }],
        },
      },
    },
  };
  admin();
  fireEvent.click(screen.getByRole('button', { name: 'Review onboarding' }));
  expect(
    screen.getByRole('heading', { name: 'Supporting documents' }),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Bank details form · payroll.png'),
  ).toBeInTheDocument();
  expect(
    screen.getByText('Original document: payroll.png'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Acknowledge local completion' }),
  ).toBeDisabled();
});

it('keeps hire preparation, pay, review and settings within the same Admin navigation', async () => {
  admin();
  const navigation = screen.getByRole('navigation', {
    name: 'admin navigation',
  });
  for (const name of [
    'Hire details',
    'Pay terms',
    'Review onboarding',
    'Settings',
    'Employees',
  ]) {
    fireEvent.click(within(navigation).getByRole('button', { name }));
    expect(screen.getByRole('navigation', { name: 'admin navigation' })).toBe(
      navigation,
    );
  }
  await waitFor(() => expect(global.fetch).toHaveBeenCalled());
});
