import { useState } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { signIn } from 'next-auth/react';
import { OnboardingApp } from './onboarding-app';
import { useSessionDraft } from './session-draft';
import type { WorkspaceRole } from '@/lib/onboarding/roles';

let sessionStatus = 'unauthenticated';
let sessionData: {
  user: { id: string; workspaceRole: WorkspaceRole };
  error?: 'RefreshAccessTokenError';
} | null = null;
const fetchConfig = jest.fn();
const originalEnvironment = process.env.NODE_ENV;

jest.mock('next-auth/react', () => ({
  useSession: () => ({ status: sessionStatus, data: sessionData }),
  signIn: jest.fn(),
}));
jest.mock('./employee-workspace', () => ({
  EmployeeWorkspace: function Employee({
    onChangeRole,
    onConnection,
  }: {
    onChangeRole: () => void;
    onConnection: () => void;
  }) {
    const { draft } = useSessionDraft();
    return (
      <div>
        <h1>Employee workspace</h1>
        <p>
          Prepared for {draft.profile.legalName || 'nobody'} · Salary{' '}
          {draft.terms.amount || 'not prepared'} · File{' '}
          {draft.identity?.name || 'none'}
        </p>
        <button onClick={onChangeRole}>Switch workspace</button>
        <button onClick={onConnection}>Document help</button>
      </div>
    );
  },
}));
jest.mock('./role-workspace', () => ({
  RoleWorkspace: function Role({
    role,
    onChangeRole,
    onPreviewEmployee,
  }: {
    role: string;
    onChangeRole: () => void;
    onPreviewEmployee: () => void;
  }) {
    const { draft, setDraft } = useSessionDraft();
    return (
      <div>
        <h1>{role} workspace</h1>
        <p>Current hire: {draft.profile.legalName || 'nobody'}</p>
        <button
          onClick={() =>
            setDraft((previous) => ({
              ...previous,
              profile: { ...previous.profile, legalName: 'Alex Morgan' },
              terms: { ...previous.terms, amount: '85000' },
              offerPrepared: true,
              identity: new File(['test identity'], 'synthetic-license.pdf'),
            }))
          }
        >
          Prepare test hire
        </button>
        <button onClick={onPreviewEmployee}>Continue as employee</button>
        <button onClick={onChangeRole}>Switch workspace</button>
      </div>
    );
  },
}));
jest.mock('./chat-assistant', () => ({
  ChatAssistant: function Assistant({
    onConnection,
  }: {
    onConnection: () => void;
  }) {
    const [value, setValue] = useState('');
    return (
      <div>
        Persistent assistant
        <button onClick={onConnection}>Assistant setup</button>
        <input
          aria-label='Test assistant draft'
          value={value}
          onChange={(event) => setValue(event.target.value)}
        />
      </div>
    );
  },
}));

beforeEach(() => {
  jest.clearAllMocks();
  sessionStatus = 'authenticated';
  sessionData = { user: { id: 'signed-in-user', workspaceRole: 'employee' } };
  jest.replaceProperty(process.env, 'NODE_ENV', 'development');
  window.history.replaceState({}, '', '/vending-machine-app');
  fetchConfig.mockResolvedValue({
    ok: true,
    json: async () => ({
      configured: true,
      tenantId: 'tenant',
      workflowId: 'workflow',
      stages: { answer: 'answer', generate: 'generate', review: 'review' },
    }),
  });
  Object.defineProperty(global, 'fetch', {
    value: fetchConfig,
    configurable: true,
    writable: true,
  });
});
afterAll(() => {
  jest.replaceProperty(process.env, 'NODE_ENV', originalEnvironment);
});

it('keeps the same session hire, pay and selected document across local handoff and role switching', async () => {
  render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Admin/ }));
  expect(
    await screen.findByRole('heading', { name: 'admin workspace' }),
  ).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Prepare test hire' }));
  fireEvent.click(screen.getByRole('button', { name: 'Continue as employee' }));
  expect(
    await screen.findByText(
      'Prepared for Alex Morgan · Salary 85000 · File synthetic-license.pdf',
    ),
  ).toBeInTheDocument();
  expect(window.location.search).toBe('?previewRole=employee');
  expect(screen.getAllByText('Persistent assistant')).toHaveLength(1);
  fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }));
  expect(window.location.search).toBe('');
  fireEvent.click(screen.getByRole('button', { name: /^Admin/ }));
  expect(
    await screen.findByText('Current hire: Alex Morgan'),
  ).toBeInTheDocument();
  expect(screen.getAllByText('Persistent assistant')).toHaveLength(1);
});

it('responds to browser back/popstate without losing the local draft', async () => {
  render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Admin/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare test hire' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue as employee' }));
  window.history.replaceState(
    {},
    '',
    '/vending-machine-app?previewRole=employer',
  );
  fireEvent.popState(window);
  expect(
    await screen.findByRole('heading', { name: 'admin workspace' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Current hire: Alex Morgan')).toBeInTheDocument();
});

it('clears the local draft when a different signed-in user enters the session', async () => {
  const { rerender } = render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Admin/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare test hire' }),
  );
  sessionStatus = 'authenticated';
  sessionData = { user: { id: 'different-user', workspaceRole: 'employee' } };
  rerender(<OnboardingApp />);
  await waitFor(() =>
    expect(screen.getByText('Current hire: nobody')).toBeInTheDocument(),
  );
});

it('requires one Microsoft login before production app use and never trusts a preview URL', async () => {
  jest.replaceProperty(process.env, 'NODE_ENV', 'production');
  sessionStatus = 'unauthenticated';
  sessionData = null;
  window.history.replaceState({}, '', '/vending-machine-app?previewRole=admin');
  render(<OnboardingApp />);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to Firstday' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Persistent assistant')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Explore demo/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with Microsoft' }),
  );
  expect(signIn).toHaveBeenCalledTimes(1);
  expect(signIn).toHaveBeenCalledWith('microsoft-entra-id', {
    callbackUrl: window.location.href,
  });
});

it.each(['admin'] as const)(
  'does not grant %s access to an employee account through the chooser or URL',
  async (role) => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    sessionStatus = 'authenticated';
    sessionData = { user: { id: 'employee', workspaceRole: 'employee' } };
    window.history.replaceState({}, '', `/vending-machine-app?role=${role}`);
    render(<OnboardingApp />);
    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('heading', { name: `${role} workspace` }),
    ).not.toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Choose another role' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: new RegExp(`^${role}`, 'i') }),
    );
    expect(
      await screen.findByRole('heading', { name: 'Access unavailable' }),
    ).toBeInTheDocument();
  },
);

it.each(['employee', 'admin'] as const)(
  'opens the assigned %s production workspace without creating preview access',
  async (role) => {
    jest.replaceProperty(process.env, 'NODE_ENV', 'production');
    sessionStatus = 'authenticated';
    sessionData = { user: { id: role, workspaceRole: role } };
    window.history.replaceState({}, '', `/vending-machine-app?role=${role}`);
    render(<OnboardingApp />);
    expect(
      await screen.findByRole('heading', {
        name: role === 'employee' ? 'Employee workspace' : `${role} workspace`,
      }),
    ).toBeInTheDocument();
    expect(window.location.search).toBe(`?role=${role}`);
  },
);

it('shows and retries real configuration errors in the connection dialog without calling a failed service configured', async () => {
  fetchConfig.mockRejectedValueOnce(
    new Error('Configuration could not be loaded. Try again.'),
  );
  render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Employee/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Assistant setup' }),
  );
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'Configuration could not be loaded',
  );
  expect(screen.queryByText('Assistant configured')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Retry loading' }));
  expect(await screen.findByText('Assistant configured')).toBeInTheDocument();
  expect(
    screen.getByText(/Send a question to test the assistant/),
  ).toBeInTheDocument();
});
it('keeps a retired Employer production URL behind the Admin permission check', async () => {
  jest.replaceProperty(process.env, 'NODE_ENV', 'production');
  sessionStatus = 'authenticated';
  sessionData = { user: { id: 'employee', workspaceRole: 'employee' } };
  window.history.replaceState({}, '', '/vending-machine-app?role=employer');
  render(<OnboardingApp />);
  expect(
    await screen.findByRole('heading', { name: 'Access unavailable' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('heading', { name: 'admin workspace' }),
  ).not.toBeInTheDocument();
});

it('preserves the assistant instance while returning to the chooser and changing roles', async () => {
  render(<OnboardingApp />);
  fireEvent.change(screen.getByLabelText('Test assistant draft'), {
    target: { value: 'My unfinished question' },
  });
  fireEvent.click(screen.getByRole('button', { name: /Admin/ }));
  await screen.findByRole('heading', { name: 'admin workspace' });
  fireEvent.click(screen.getByRole('button', { name: 'Switch workspace' }));
  fireEvent.click(screen.getByRole('button', { name: /Employee/ }));
  await screen.findByRole('heading', { name: 'Employee workspace' });
  expect(screen.getByLabelText('Test assistant draft')).toHaveValue(
    'My unfinished question',
  );
});

it('opens document help for the upload page and assistant help for chat', async () => {
  render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Employee/ }));
  fireEvent.click(await screen.findByRole('button', { name: 'Document help' }));
  expect(
    await screen.findByRole('heading', { name: 'Document help' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Assistant configured')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Close help' }));
  fireEvent.click(screen.getByRole('button', { name: 'Assistant setup' }));
  expect(
    screen.getByRole('heading', { name: 'Assistant settings' }),
  ).toBeInTheDocument();
});

it('reloads document settings after Admin setup changes without losing the session file', async () => {
  render(<OnboardingApp />);
  fireEvent.click(screen.getByRole('button', { name: /^Admin/ }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'Prepare test hire' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Continue as employee' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Document help' }));
  expect(
    await screen.findByText('Document setup required'),
  ).toBeInTheDocument();
  fetchConfig.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      configured: true,
      documents: { configured: true, mode: 'direct' },
    }),
  });
  fireEvent.click(screen.getByRole('button', { name: 'Reload settings' }));
  expect(
    await screen.findByText('Document service configured'),
  ).toBeInTheDocument();
  expect(screen.getByText(/File synthetic-license.pdf/)).toBeInTheDocument();
});

it('shows Microsoft sign-in before local previews and opens all tools after the same login', async () => {
  sessionStatus = 'unauthenticated';
  sessionData = null;
  window.history.replaceState(
    {},
    '',
    '/vending-machine-app?previewRole=employee',
  );
  const view = render(<OnboardingApp />);
  expect(
    await screen.findByRole('heading', { name: 'Sign in to Firstday' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Persistent assistant')).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with Microsoft' }),
  );
  sessionStatus = 'authenticated';
  sessionData = { user: { id: 'microsoft-user', workspaceRole: 'employee' } };
  view.rerender(<OnboardingApp />);
  expect(
    await screen.findByRole('heading', { name: 'Employee workspace' }),
  ).toBeInTheDocument();
  expect(screen.getByText('Persistent assistant')).toBeInTheDocument();
  expect(signIn).toHaveBeenCalledTimes(1);
});
it('keeps the unsigned local demo explicit and never makes it a signed-in session', async () => {
  sessionStatus = 'unauthenticated';
  sessionData = null;
  render(<OnboardingApp />);
  fireEvent.click(
    await screen.findByRole('button', {
      name: 'Explore demo without signing in',
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: /^Employee/ }));
  expect(
    await screen.findByRole('heading', { name: 'Employee workspace' }),
  ).toBeInTheDocument();
  expect(signIn).not.toHaveBeenCalled();
  expect(sessionStatus).toBe('unauthenticated');
});
it('handles expired shared sessions once at the app boundary, without separate tool logins', async () => {
  sessionData = {
    user: { id: 'signed-in-user', workspaceRole: 'employee' },
    error: 'RefreshAccessTokenError',
  };
  render(<OnboardingApp />);
  expect(
    await screen.findByRole('heading', { name: 'Sign in again' }),
  ).toBeInTheDocument();
  expect(screen.queryByText('Persistent assistant')).not.toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: /Explore demo/ }),
  ).not.toBeInTheDocument();
  fireEvent.click(
    screen.getByRole('button', { name: 'Continue with Microsoft' }),
  );
  expect(signIn).toHaveBeenCalledTimes(1);
});
it('waits for initial session verification without flashing private tools or a login prompt', () => {
  sessionStatus = 'loading';
  sessionData = null;
  render(<OnboardingApp />);
  expect(screen.getByRole('status')).toHaveTextContent('Checking your sign-in');
  expect(
    screen.queryByRole('button', { name: 'Continue with Microsoft' }),
  ).not.toBeInTheDocument();
  expect(screen.queryByText('Persistent assistant')).not.toBeInTheDocument();
});
