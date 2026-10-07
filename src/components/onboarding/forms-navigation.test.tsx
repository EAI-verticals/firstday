import { fireEvent, render, screen, within } from '@testing-library/react';
import { OnboardingApp } from './onboarding-app';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: {
      user: { id: 'test-user', name: 'Taylor', workspaceRole: 'employee' },
    },
  }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
jest.mock('./chat-assistant', () => ({
  ChatAssistant: () => <p>Assistant stays available</p>,
}));
jest.mock('./identity-document-review', () => ({
  IdentityDocumentReview: () => <p>Document preview</p>,
}));
jest.mock('@/lib/onboarding/files', () => ({
  downloadPdf: jest.fn(),
  generateDocument: jest.fn(async () => new Uint8Array([1])),
  generateCheckedDocument: jest.fn(),
  generateSalaryConfirmation: jest.fn(),
  readDocument: jest.fn(),
}));

const originalEnvironment = process.env.NODE_ENV;
beforeEach(() => {
  jest.clearAllMocks();
  jest.replaceProperty(process.env, 'NODE_ENV', 'development');
  Object.defineProperty(window, 'scrollTo', {
    value: jest.fn(),
    writable: true,
  });
  global.fetch = jest.fn().mockResolvedValue({
    ok: true,
    json: async () => ({
      configured: true,
      tenantId: 'test',
      workflowId: 'test',
      stages: { answer: 'answer', generate: 'generate', review: 'review' },
      documents: { configured: false },
    }),
  });
});
afterAll(() =>
  jest.replaceProperty(process.env, 'NODE_ENV', originalEnvironment),
);

it.each(['employee', 'admin'] as const)(
  'removes Forms from %s while preserving role navigation',
  async (role) => {
    window.history.replaceState(
      {},
      '',
      `/vending-machine-app?previewRole=${role}`,
    );
    render(<OnboardingApp />);
    const navigation = await screen.findByRole('navigation', {
      name: `${role} navigation`,
    });
    expect(
      within(navigation).queryByRole('button', { name: 'Forms' }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole('group', { name: 'Form tools' }),
    ).not.toBeInTheDocument();
    expect(screen.getAllByRole('navigation')).toHaveLength(1);
    expect(
      within(navigation).getByRole('button', {
        name: role === 'admin' ? 'Employees' : 'Home',
      }),
    ).toHaveAttribute('aria-current', 'page');
    if (role === 'admin') {
      expect(
        screen.getByRole('button', { name: 'Add employee' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('heading', { name: 'Service configuration' }),
      ).not.toBeInTheDocument();
      fireEvent.click(
        within(navigation).getByRole('button', { name: 'Settings' }),
      );
      expect(
        screen.getByRole('heading', { name: 'Service configuration' }),
      ).toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'Add employee' }),
      ).not.toBeInTheDocument();
      expect(screen.getAllByRole('navigation')).toHaveLength(1);
    }
    if (role === 'employee') {
      fireEvent.click(
        within(navigation).getByRole('button', { name: 'My profile' }),
      );
      expect(screen.getByLabelText(/Full legal name/)).toBeInTheDocument();
      fireEvent.click(
        within(navigation).getByRole('button', { name: 'My documents' }),
      );
      expect(
        screen.getByRole('heading', { name: 'My documents', level: 1 }),
      ).toBeInTheDocument();
    }
    expect(screen.getByText('Assistant stays available')).toBeInTheDocument();
  },
);
