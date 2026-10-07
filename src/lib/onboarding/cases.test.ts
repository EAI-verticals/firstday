import {
  initialTasks,
  isOverdue,
  localDate,
  outstandingAssignments,
  policyRead,
  validDate,
  loadDemoVault,
  saveDemoVault,
} from './cases';

test('first-day defaults have owners and follow the start date', () => {
  const tasks = initialTasks('2026-10-20');
  expect(new Set(tasks.map((task) => task.id)).size).toBe(3);
  expect(tasks.map((task) => task.owner)).toEqual([
    'admin',
    'admin',
    'employee',
  ]);
  expect(
    tasks.every(
      (task) => task.relativeToStart && task.dueDate === '2026-10-20',
    ),
  ).toBe(true);
});
test.each(['2026-02-30', '2025-02-29', 'bad', '2026-1-01', ''])(
  'rejects invalid date %s',
  (date) => expect(validDate(date)).toBe(false),
);
test('accepts a real leap day', () =>
  expect(validDate('2024-02-29')).toBe(true));
test('overdue excludes completed, today and undated tasks', () => {
  const task = {
    id: 'task',
    title: 'Collect laptop',
    owner: 'employee' as const,
    dueDate: '2000-01-01',
  };
  expect(isOverdue(task)).toBe(true);
  expect(isOverdue({ ...task, completedAt: new Date().toISOString() })).toBe(
    false,
  );
  expect(isOverdue({ ...task, dueDate: localDate() })).toBe(false);
  expect(isOverdue({ ...task, dueDate: '' })).toBe(false);
});
test('policy acknowledgements require the actual current version', () => {
  const policy = {
    id: 'p',
    title: 'Safety',
    version: '2',
    file: new File(['policy'], 'policy.pdf'),
  };
  const previous = [
    { policyId: 'p', version: '1', acknowledgedAt: '2026-10-01' },
  ];
  expect(policyRead(policy, previous)).toBe(false);
  expect(outstandingAssignments([], [policy], previous)).toEqual([
    'Acknowledge Safety, version 2',
  ]);
  expect(policyRead(policy, [{ ...previous[0], version: '2' }])).toBe(true);
});

// Tests transaction behaviour; browser structured cloning remains a separate live gate.
function storage(stored?: unknown): {
  put: jest.Mock;
  close: jest.Mock;
  abort: jest.Mock;
} {
  const put = jest.fn();
  const close = jest.fn();
  const abort = jest.fn();
  const db = {
    close,
    transaction: jest.fn((_name, mode) => {
      const tx: Record<string, unknown> = {};
      tx.abort = () => {
        abort();
        (tx.onabort as () => void)?.();
      };
      tx.objectStore = () => ({
        put,
        get: () => {
          const request: Record<string, unknown> = { result: stored };
          queueMicrotask(() => {
            (request.onsuccess as () => void)?.();
            if (mode === 'readonly' || put.mock.calls.length)
              (tx.oncomplete as () => void)?.();
          });
          return request;
        },
      });
      return tx;
    }),
  };
  Object.defineProperty(global, 'indexedDB', {
    configurable: true,
    value: {
      open: () => {
        const request: Record<string, unknown> = { result: db };
        queueMicrotask(() => (request.onsuccess as () => void)?.());
        return request;
      },
    },
  });
  return { put, close, abort };
}
afterEach(() => {
  Reflect.deleteProperty(global, 'indexedDB');
});
test('loads the account vault and closes the connection', async () => {
  const value = { revision: 2, records: [] };
  const db = storage(value);
  await expect(loadDemoVault('account-a')).resolves.toBe(value);
  expect(db.close).toHaveBeenCalled();
});
test('saves with a new revision after checking the stored revision', async () => {
  const db = storage({ revision: 3 });
  await expect(
    saveDemoVault('account-a', { records: ['record'] }, 3),
  ).resolves.toBe(4);
  expect(db.put).toHaveBeenCalledWith(
    { revision: 4, records: ['record'] },
    'account-a',
  );
  expect(db.close).toHaveBeenCalled();
});
test('aborts stale tab saves without overwriting the newer vault', async () => {
  const db = storage({ revision: 4 });
  await expect(saveDemoVault('account-a', { records: [] }, 3)).rejects.toThrow(
    'Another tab',
  );
  expect(db.put).not.toHaveBeenCalled();
  expect(db.abort).toHaveBeenCalled();
});
