import type { WorkspaceRole } from './roles';

export interface OnboardingTask {
  id: string;
  title: string;
  owner: WorkspaceRole;
  dueDate: string;
  completedAt?: string;
  relativeToStart?: boolean;
}
export interface CompanyPolicy {
  id: string;
  title: string;
  version: string;
  file: File;
}
export interface PolicyAcknowledgement {
  policyId: string;
  version: string;
  acknowledgedAt: string;
}
export interface OnboardingActivity {
  id: string;
  at: string;
  actor: string;
  action: string;
}

export function caseId(): string {
  return (
    globalThis.crypto?.randomUUID?.() ||
    `local-${Date.now()}-${Math.random().toString(36).slice(2)}`
  );
}
export function initialTasks(startDate: string): OnboardingTask[] {
  return [
    ['Work email and system access', 'admin'],
    ['Equipment ready for collection', 'admin'],
    ['Complete your induction', 'employee'],
  ].map(([title, owner]) => ({
    id: caseId(),
    title,
    owner: owner as WorkspaceRole,
    dueDate: startDate,
    relativeToStart: true,
  }));
}
export function localDate(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
}
export function isOverdue(task: OnboardingTask): boolean {
  return Boolean(
    task.dueDate && !task.completedAt && task.dueDate < localDate(),
  );
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00Z`);
  return (
    Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value
  );
}

export function outstandingAssignments(
  tasks: OnboardingTask[],
  policies: CompanyPolicy[],
  acknowledgements: PolicyAcknowledgement[],
): string[] {
  return [
    ...tasks
      .filter((task) => !task.completedAt)
      .map((task) => `${task.title} (${task.owner})`),
    ...policies
      .filter((policy) => !policyRead(policy, acknowledgements))
      .map(
        (policy) => `Acknowledge ${policy.title}, version ${policy.version}`,
      ),
  ];
}
export function policyRead(
  policy: CompanyPolicy,
  acknowledgements: PolicyAcknowledgement[],
): boolean {
  return acknowledgements.some(
    (item) => item.policyId === policy.id && item.version === policy.version,
  );
}

/** Local walkthrough only. File objects survive structured cloning in IndexedDB. */
function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open('firstday-local-walkthrough', 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore('accounts');
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error('Local record storage is unavailable.'));
    request.onblocked = () =>
      reject(new Error('Close older Firstday tabs to save local records.'));
  });
}
export async function loadDemoVault(account: string): Promise<unknown> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readonly');
    const request = tx.objectStore('accounts').get(account);
    tx.oncomplete = () => {
      db.close();
      resolve(request.result);
    };
    tx.onerror = () => {
      db.close();
      reject(new Error('Saved local records could not be loaded.'));
    };
    tx.onabort = tx.onerror;
  });
}
export async function saveDemoVault(
  account: string,
  value: Record<string, unknown>,
  expectedRevision: number,
): Promise<number> {
  const db = await database();
  return new Promise((resolve, reject) => {
    const tx = db.transaction('accounts', 'readwrite');
    const store = tx.objectStore('accounts');
    const existing = store.get(account);
    let conflict = false;
    existing.onsuccess = () => {
      const revision = existing.result?.revision || 0;
      if (revision !== expectedRevision) {
        conflict = true;
        tx.abort();
        return;
      }
      store.put({ ...value, revision: expectedRevision + 1 }, account);
    };
    tx.oncomplete = () => {
      db.close();
      resolve(expectedRevision + 1);
    };
    tx.onerror = () => {
      db.close();
      reject(
        new Error(
          conflict
            ? 'Another tab changed these records. Keep this tab open to preserve your unsaved changes.'
            : 'Changes could not be saved in this browser. Keep this tab open.',
        ),
      );
    };
    tx.onabort = tx.onerror;
  });
}
