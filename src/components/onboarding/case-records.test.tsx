import { act, fireEvent, render, screen } from '@testing-library/react';
import { CaseRecords, AssignedOnboarding } from './case-records';
import { SessionDraftProvider, useSessionDraft } from './session-draft';
import { EMPTY_PROFILE, EMPTY_TERMS } from '@/lib/onboarding/employee-workflow';

jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: 'authenticated',
    data: { user: { id: 'owner', name: 'Demo owner' } },
  }),
}));
let store: ReturnType<typeof useSessionDraft>;
function Probe(): null {
  store = useSessionDraft();
  return null;
}
function view(role: 'admin' | 'admin' = 'admin'): void {
  render(
    <SessionDraftProvider>
      <Probe />
      <CaseRecords role={role} />
    </SessionDraftProvider>,
  );
}
function hire(name = 'Taylor Sample', email = 'taylor@example.test'): void {
  fireEvent.click(screen.getByRole('button', { name: 'Add employee' }));
  for (const [label, value] of [
    ['Employee name', name],
    ['Employee email', email],
    ['Department', 'Operations'],
    ['Job title', 'Coordinator'],
    ['Manager', 'Sam Sample'],
    ['Start date', '2026-10-20'],
    ['Company', 'Demo Company'],
    ['Annual salary (AUD)', '85000'],
  ])
    fireEvent.change(screen.getByLabelText(label), { target: { value } });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create employee record' }),
  );
}
beforeEach(() => {
  window.history.replaceState({}, '', '/');
  URL.createObjectURL = jest.fn(() => 'blob:policy');
  URL.revokeObjectURL = jest.fn();
});
test('creates a distinct prefilled hire without inventing private fields or completion', () => {
  view();
  hire();
  expect(store.draft.profile).toMatchObject({
    legalName: 'Taylor Sample',
    email: 'taylor@example.test',
    role: 'Coordinator',
    phone: '',
    birthDate: '',
    emergencyName: '',
  });
  expect(store.draft.saved).toBe(false);
  expect(store.draft.tasks).toHaveLength(3);
  expect(window.location.search).toContain(`case=${store.draft.caseId}`);
  const first = store.draft.caseId;
  hire('Robin Sample', 'robin@example.test');
  expect(store.records).toHaveLength(2);
  fireEvent.click(screen.getByRole('button', { name: 'Open Taylor Sample' }));
  expect(store.draft.caseId).toBe(first);
  expect(store.draft.profile.legalName).toBe('Taylor Sample');
});
test('rejects duplicate email and keeps the existing employee intact', () => {
  view();
  hire();
  hire('Other name', 'taylor@example.test');
  expect(screen.getByRole('alert')).toHaveTextContent('already exists');
  expect(store.records).toHaveLength(1);
  expect(store.draft.profile.legalName).toBe('Taylor Sample');
});
test('editing hire details preserves hourly/currency terms and clears stale reviews', () => {
  view();
  hire();
  act(() =>
    store.setDraft((old) => ({
      ...old,
      terms: {
        ...old.terms,
        basis: 'per hour',
        currency: 'USD',
        hours: '20',
        employmentType: 'Part-time',
      },
      saved: true,
      reviewed: true,
      employerReviewed: true,
    })),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Edit hire details' }));
  fireEvent.change(screen.getByLabelText('Employee name'), {
    target: { value: 'Taylor Corrected' },
  });
  fireEvent.change(screen.getByLabelText('Start date'), {
    target: { value: '2026-10-21' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hire changes' }));
  expect(store.draft.terms).toMatchObject({
    basis: 'per hour',
    currency: 'USD',
    hours: '20',
    employmentType: 'Part-time',
  });
  expect(store.draft.saved).toBe(false);
  expect(store.draft.reviewed).toBe(false);
  expect(store.draft.employerReviewed).toBe(false);
  expect(
    store.draft.tasks?.every((task) => task.dueDate === '2026-10-21'),
  ).toBe(true);
});
test('changing first-day instructions alone keeps confirmed details', () => {
  view();
  hire();
  act(() => store.setDraft((old) => ({ ...old, saved: true, reviewed: true })));
  fireEvent.click(screen.getByRole('button', { name: 'Edit hire details' }));
  fireEvent.change(screen.getByLabelText('Arrival and contact details'), {
    target: { value: 'Meet Sam at reception at 9am.' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Save hire changes' }));
  expect(store.draft.saved).toBe(true);
  expect(store.draft.firstDayNotes).toBe('Meet Sam at reception at 9am.');
});
test('switching records closes the editor instead of updating the wrong employee', () => {
  view();
  hire();
  hire('Robin Sample', 'robin@example.test');
  fireEvent.click(screen.getByRole('button', { name: 'Edit hire details' }));
  fireEvent.change(screen.getByLabelText('Employee name'), {
    target: { value: 'Wrong target' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open Taylor Sample' }));
  expect(
    screen.queryByRole('button', { name: 'Save hire changes' }),
  ).not.toBeInTheDocument();
  expect(store.records.map((record) => record.draft.profile.legalName)).toEqual(
    ['Taylor Sample', 'Robin Sample'],
  );
});
test('clipboard completion cannot mark a different case invited', async () => {
  let finish: () => void = () => undefined;
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: {
      writeText: jest.fn(
        () =>
          new Promise<void>((resolve) => {
            finish = resolve;
          }),
      ),
    },
  });
  view();
  hire();
  hire('Robin Sample', 'robin@example.test');
  fireEvent.click(
    screen.getByRole('button', { name: 'Copy demo invitation link' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open Taylor Sample' }));
  await act(async () => finish());
  expect(store.draft.invitedAt).toBeUndefined();
  expect(screen.getByText(/no email was sent/)).toBeInTheDocument();
});
function assigned(role: 'employee' | 'admin' = 'employee'): void {
  render(
    <SessionDraftProvider>
      <Probe />
      <AssignedOnboarding role={role} />
    </SessionDraftProvider>,
  );
  act(() =>
    store.createCase(
      { ...EMPTY_PROFILE, legalName: 'Sample', startDate: '2026-10-20' },
      { ...EMPTY_TERMS, company: 'Demo', amount: '85000' },
    ),
  );
}
test('employees can complete their own task but cannot complete employer tasks', () => {
  assigned();
  expect(screen.getByLabelText(/Work email and system access/)).toBeDisabled();
  const induction = screen.getByLabelText(/Complete your induction/);
  fireEvent.click(induction);
  expect(
    store.draft.tasks?.find((task) => task.owner === 'employee')?.completedAt,
  ).toBeTruthy();
  expect(
    store.draft.activity?.some(
      (item) => item.action === 'Assigned tasks updated',
    ),
  ).toBe(true);
});
test('overdue notice disappears when the responsible employer completes the task', () => {
  assigned('admin');
  act(() =>
    store.setDraft((old) => ({
      ...old,
      tasks: old.tasks?.map((task, index) => ({
        ...task,
        dueDate: index ? '2999-01-01' : '2000-01-01',
      })),
    })),
  );
  expect(screen.getByRole('status')).toHaveTextContent('1 task is overdue');
  fireEvent.click(screen.getByLabelText(/Work email and system access/));
  expect(screen.queryByText(/task is overdue/)).not.toBeInTheDocument();
});
test('task creation requires a deadline and assigns a clear owner', () => {
  assigned('admin');
  fireEvent.change(screen.getByLabelText('Task'), {
    target: { value: 'Site induction' },
  });
  fireEvent.submit(screen.getByLabelText('Task').closest('form')!);
  expect(screen.getByRole('alert')).toHaveTextContent('valid due date');
  fireEvent.change(screen.getByLabelText('Due date'), {
    target: { value: '2026-10-21' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Add task' }));
  expect(store.draft.tasks).toHaveLength(4);
  expect(store.draft.tasks?.[3]).toMatchObject({
    title: 'Site induction',
    owner: 'employee',
    dueDate: '2026-10-21',
  });
});
test('selecting another case clears a task drafted for the previous employee', () => {
  assigned('admin');
  fireEvent.change(screen.getByLabelText('Task'), {
    target: { value: 'Task for Taylor' },
  });
  fireEvent.change(screen.getByLabelText('Due date'), {
    target: { value: '2026-11-01' },
  });
  act(() =>
    store.createCase(
      { ...EMPTY_PROFILE, legalName: 'Robin', startDate: '2026-11-02' },
      { ...EMPTY_TERMS, company: 'Demo', amount: '85000' },
    ),
  );
  expect(screen.getByLabelText('Task')).toHaveValue('');
  expect(screen.getByLabelText('Due date')).toHaveValue('');
  expect(store.draft.tasks).toHaveLength(3);
});
test('policy requires opening its actual file and acknowledges only the current version', () => {
  assigned();
  const file = new File(['Actual synthetic policy'], 'safety.pdf', {
    type: 'application/pdf',
  });
  act(() =>
    store.addPolicy({
      id: 'safety',
      title: 'Safety policy',
      version: '1',
      file,
    }),
  );
  const button = screen.getByRole('button', { name: /I have read/ });
  expect(button).toBeDisabled();
  const link = screen.getByRole('link', { name: /Read document/ });
  expect(link).toHaveAttribute('href', 'blob:policy');
  fireEvent.click(link);
  fireEvent.click(button);
  expect(store.draft.policyAcknowledgements?.[0]).toMatchObject({
    policyId: 'safety',
    version: '1',
    acknowledgedAt: expect.any(String),
  });
  act(() =>
    store.addPolicy({
      id: 'other',
      title: 'Safety policy',
      version: '2',
      file,
    }),
  );
  expect(store.policies[0].id).toBe('safety');
  expect(screen.getByRole('button', { name: /I have read/ })).toBeDisabled();
  expect(screen.queryByText('Read and acknowledged')).not.toBeInTheDocument();
  expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:policy');
});
test('admin uploads a real policy file and must use a new version for replacements', () => {
  view();
  const file = new File(['Synthetic policy'], 'safety.pdf', {
    type: 'application/pdf',
  });
  const fill = (version: string): void => {
    fireEvent.change(screen.getByLabelText('Policy title'), {
      target: { value: 'Safety policy' },
    });
    fireEvent.change(screen.getByLabelText('Policy version'), {
      target: { value: version },
    });
    fireEvent.change(screen.getByLabelText('Policy PDF'), {
      target: { files: [file] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Add policy' }));
  };
  fill('1');
  expect(store.policies[0]).toMatchObject({
    title: 'Safety policy',
    version: '1',
  });
  expect(store.policies[0].file).toBe(file);
  fill('1');
  expect(screen.getByRole('alert')).toHaveTextContent('Use a new version');
  expect(store.policies).toHaveLength(1);
  const id = store.policies[0].id;
  fill('2');
  expect(store.policies).toHaveLength(1);
  expect(store.policies[0]).toMatchObject({ id, version: '2' });
});
