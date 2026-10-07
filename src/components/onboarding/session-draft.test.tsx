import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  SessionDraftProvider,
  emptySessionDraft,
  useSessionDraft,
  type SavedCase,
} from './session-draft';
import { EMPTY_PROFILE, EMPTY_TERMS } from '@/lib/onboarding/employee-workflow';
import { loadDemoVault, saveDemoVault } from '@/lib/onboarding/cases';

let mockUser = 'account-a';
let mockStatus = 'authenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: mockStatus,
    data: { user: { id: mockUser, name: 'Demo user' } },
  }),
}));
jest.mock('@/lib/onboarding/cases', () => ({
  ...jest.requireActual('@/lib/onboarding/cases'),
  loadDemoVault: jest.fn(),
  saveDemoVault: jest.fn(),
}));
let store: ReturnType<typeof useSessionDraft>;
function Probe(): React.ReactNode {
  store = useSessionDraft();
  return (
    <>
      <output data-testid='name'>
        {store.draft.profile.legalName || 'No employee'}
      </output>
      <output data-testid='status'>{store.saveStatus}</output>
      <output data-testid='notice'>{store.recordNotice}</output>
      <button
        onClick={() =>
          store.createCase(
            {
              ...EMPTY_PROFILE,
              legalName: 'Taylor Sample',
              email: 'sample@example.test',
              startDate: '2026-10-20',
            },
            { ...EMPTY_TERMS, company: 'Demo', amount: '85000' },
          )
        }
      >
        Create test hire
      </button>
    </>
  );
}
function App(): React.ReactNode {
  return (
    <SessionDraftProvider>
      <Probe />
    </SessionDraftProvider>
  );
}
const vaults = new Map<string, unknown>();
const oldEnv = process.env;
beforeAll(() => {
  process.env = { ...oldEnv, NODE_ENV: 'development' };
});
afterAll(() => {
  process.env = oldEnv;
  Reflect.deleteProperty(global, 'indexedDB');
});
beforeEach(() => {
  Object.defineProperty(global, 'indexedDB', { configurable: true, value: {} });
  mockUser = 'account-a';
  mockStatus = 'authenticated';
  vaults.clear();
  jest.clearAllMocks();
  window.history.replaceState({}, '', '/');
  jest
    .mocked(loadDemoVault)
    .mockImplementation(async (account) => vaults.get(account));
  jest
    .mocked(saveDemoVault)
    .mockImplementation(async (account, value, revision) => {
      vaults.set(account, { ...value, revision: revision + 1 });
      return revision + 1;
    });
});
test('waits for storage before allowing edits and preserves files on adapter reload', async () => {
  const first = render(<App />);
  expect(screen.getByRole('status')).toHaveTextContent('Loading');
  await screen.findByRole('button', { name: 'Create test hire' });
  fireEvent.click(screen.getByRole('button', { name: 'Create test hire' }));
  const file = new File(['Synthetic licence'], 'sample.pdf', {
    type: 'application/pdf',
  });
  act(() => store.setDraft((old) => ({ ...old, identity: file })));
  await waitFor(() =>
    expect(screen.getByTestId('status')).toHaveTextContent(
      'Saved in this browser only',
    ),
  );
  first.unmount();
  jest.mocked(saveDemoVault).mockClear();
  render(<App />);
  await screen.findByText('Taylor Sample');
  expect(store.draft.identity).toBe(file);
  expect(store.records).toHaveLength(1);
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(saveDemoVault).not.toHaveBeenCalled();
});
test('session refresh for the same account never reloads stale saved data', async () => {
  const view = render(<App />);
  await screen.findByRole('button', { name: 'Create test hire' });
  fireEvent.click(screen.getByRole('button', { name: 'Create test hire' }));
  mockStatus = 'loading';
  view.rerender(<App />);
  mockStatus = 'authenticated';
  view.rerender(<App />);
  expect(screen.getByTestId('name')).toHaveTextContent('Taylor Sample');
  expect(loadDemoVault).toHaveBeenCalledTimes(1);
});
test('switching accounts clears the visible case and never writes it into the new account', async () => {
  const view = render(<App />);
  await screen.findByRole('button', { name: 'Create test hire' });
  fireEvent.click(screen.getByRole('button', { name: 'Create test hire' }));
  mockUser = 'account-b';
  view.rerender(<App />);
  expect(screen.queryByText('Taylor Sample')).not.toBeInTheDocument();
  await screen.findByText('No employee');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 250)));
  expect(vaults.has('account-b')).toBe(false);
  expect(store.records).toHaveLength(0);
});
test('load errors protect stored data and offer retry instead of an empty overwrite', async () => {
  jest
    .mocked(loadDemoVault)
    .mockRejectedValueOnce(new Error('Storage blocked'));
  render(<App />);
  await screen.findByRole('button', { name: 'Retry loading records' });
  expect(
    screen.queryByRole('button', { name: 'Create test hire' }),
  ).not.toBeInTheDocument();
  expect(saveDemoVault).not.toHaveBeenCalled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Retry loading records' }),
  );
  await screen.findByRole('button', { name: 'Create test hire' });
});
test('a save failure keeps the draft and gives an explicit warning', async () => {
  jest
    .mocked(saveDemoVault)
    .mockRejectedValue(
      new Error('Changes could not be saved. Keep this tab open.'),
    );
  render(<App />);
  await screen.findByRole('button', { name: 'Create test hire' });
  fireEvent.click(screen.getByRole('button', { name: 'Create test hire' }));
  await waitFor(() =>
    expect(screen.getByTestId('status')).toHaveTextContent(
      'could not be saved',
    ),
  );
  expect(store.draft.profile.legalName).toBe('Taylor Sample');
  expect(store.records).toHaveLength(1);
});
test('unknown invitation ID shows no private record from another account', async () => {
  window.history.replaceState({}, '', '/?case=foreign-case');
  vaults.set('account-a', {
    records: [] as SavedCase[],
    policies: [],
    revision: 1,
  });
  render(<App />);
  await screen.findByText('No employee');
  expect(screen.getByTestId('notice')).toHaveTextContent(
    'another browser or account',
  );
});
test('invalid invitation warning survives autosave of an existing own vault', async () => {
  const first = render(<App />);
  await screen.findByRole('button', { name: 'Create test hire' });
  fireEvent.click(screen.getByRole('button', { name: 'Create test hire' }));
  await waitFor(() =>
    expect(screen.getByTestId('status')).toHaveTextContent(
      'Saved in this browser only',
    ),
  );
  first.unmount();
  window.history.replaceState({}, '', '/?case=foreign-case');
  jest.mocked(saveDemoVault).mockClear();
  render(<App />);
  await screen.findByText('No employee');
  await act(async () => new Promise((resolve) => setTimeout(resolve, 300)));
  expect(screen.getByTestId('notice')).toHaveTextContent(
    'another browser or account',
  );
  expect(store.records).toHaveLength(1);
  expect(store.draft.profile.legalName).toBe('');
  expect(saveDemoVault).not.toHaveBeenCalled();
});
test('a link in a browser with no records explains the missing assignment', async () => {
  window.history.replaceState({}, '', '/?case=foreign-case');
  render(<App />);
  await screen.findByText('No employee');
  expect(screen.getByTestId('notice')).toHaveTextContent(
    'Live invitations are not connected',
  );
});
test('malformed saved fields block loading instead of crashing or overwriting', async () => {
  vaults.set('account-a', {
    records: [
      {
        id: 'bad',
        draft: {
          caseId: 'bad',
          profile: { legalName: 'Sample' },
          terms: { amount: 10 },
        },
      },
    ],
    policies: [],
  });
  render(<App />);
  await screen.findByRole('button', { name: 'Retry loading records' });
  expect(saveDemoVault).not.toHaveBeenCalled();
});
test('migrates retired Employer task owners without dropping a saved file or review', async () => {
  const file = new File(['Synthetic document'], 'sample.pdf', {
    type: 'application/pdf',
  });
  const draft = {
    ...emptySessionDraft(),
    caseId: 'legacy',
    identity: file,
    employerReviewed: true,
    tasks: [
      {
        id: 'it',
        title: 'Collect laptop',
        owner: 'employer',
        dueDate: '2026-10-20',
      },
    ],
  };
  vaults.set('account-a', {
    records: [{ id: 'legacy', draft, updatedAt: '2026-10-07' }],
    policies: [],
    activeCaseId: 'legacy',
    revision: 1,
  });
  render(<App />);
  await screen.findByText('No employee');
  expect(store.draft.caseId).toBe('legacy');
  expect(store.draft.tasks?.[0].owner).toBe('admin');
  expect(store.draft.identity).toBe(file);
  expect(store.draft.employerReviewed).toBe(true);
});
