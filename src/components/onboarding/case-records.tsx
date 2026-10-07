'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSessionDraft } from './session-draft';
import {
  EMPTY_PROFILE,
  EMPTY_TERMS,
  termsIssues,
  type EmployeeProfile,
} from '@/lib/onboarding/employee-workflow';
import {
  caseId,
  isOverdue,
  policyRead,
  outstandingAssignments,
  validDate,
  type CompanyPolicy,
} from '@/lib/onboarding/cases';
import type { WorkspaceRole } from '@/lib/onboarding/roles';

/** Record management for the explicitly local walkthrough, not a live HR database. */
export function CaseRecords({
  role,
  onEmployee,
}: {
  role: 'admin';
  onEmployee?: () => void;
}): ReactNode {
  const {
    draft,
    records,
    policies,
    saveStatus,
    recordNotice,
    createCase,
    selectCase,
    addPolicy,
    setDraft,
  } = useSessionDraft();
  const [creating, setCreating] = useState(false);
  const [profile, setProfile] = useState({ ...EMPTY_PROFILE });
  const [company, setCompany] = useState('');
  const [salary, setSalary] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [title, setTitle] = useState('');
  const [version, setVersion] = useState('');
  const [policyFile, setPolicyFile] = useState<File | null>(null);
  const policyInput = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [editingCase, setEditingCase] = useState<string>();
  const [firstDayNotes, setFirstDayNotes] = useState('');
  useEffect(() => {
    setCreating(false);
    setEditing(false);
    setEditingCase(undefined);
    setError('');
    setNotice('');
  }, [draft.caseId]);
  const fields: Array<[keyof EmployeeProfile, string, string]> = [
    ['legalName', 'Employee name', 'text'],
    ['email', 'Employee email', 'email'],
    ['department', 'Department', 'text'],
    ['role', 'Job title', 'text'],
    ['manager', 'Manager', 'text'],
    ['startDate', 'Start date', 'date'],
  ];
  return (
    <section className='ew-card'>
      <div className='fd-card-heading'>
        <h2>Employees</h2>
        <button
          className='ob-button primary'
          onClick={() => {
            setCreating(!creating);
            setEditing(false);
            setProfile({ ...EMPTY_PROFILE });
            setCompany('');
            setSalary('');
            setFirstDayNotes('');
            setError('');
          }}
        >
          Add employee
        </button>
      </div>
      <p className='ew-muted'>
        Local walkthrough: records and files save in this browser, for this
        signed-in account. Use synthetic data.
      </p>
      {saveStatus && <p role='status'>{saveStatus}</p>}
      {recordNotice && (
        <p role='alert' className='fd-alert warning'>
          {recordNotice}
        </p>
      )}
      {error && (
        <p className='fd-alert danger' role='alert'>
          {error}
        </p>
      )}
      {notice && <p role='status'>{notice}</p>}
      {creating && (
        <form
          onSubmit={(event) => {
            event.preventDefault();
            if (editing && editingCase !== draft.caseId) {
              setError(
                'The selected employee changed. Open their details again.',
              );
              return;
            }
            const terms = {
              ...(editing ? draft.terms : EMPTY_TERMS),
              company: company.trim(),
              amount: salary.trim(),
            };
            if (
              fields.some(([key]) => !profile[key].trim()) ||
              !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email) ||
              termsIssues(terms).length
            ) {
              setError('Complete the employee details and valid pay terms.');
              return;
            }
            if (!validDate(profile.startDate)) {
              setError('Enter a valid start date.');
              return;
            }
            if (
              records.some(
                (item) =>
                  item.id !== (editing ? draft.caseId : undefined) &&
                  item.draft.profile.email.trim().toLowerCase() ===
                    profile.email.trim().toLowerCase(),
              )
            ) {
              setError(
                'An employee record already exists for this email. Open that record to edit it.',
              );
              return;
            }
            const nextProfile = {
              ...profile,
              email: profile.email.trim().toLowerCase(),
              legalName: profile.legalName.trim(),
              department: profile.department.trim(),
              role: profile.role.trim(),
              manager: profile.manager.trim(),
            };
            const hireChanged =
              JSON.stringify(draft.profile) !== JSON.stringify(nextProfile) ||
              JSON.stringify(draft.terms) !== JSON.stringify(terms);
            if (editing) {
              setDraft((old) => {
                const changed =
                  JSON.stringify(old.profile) !== JSON.stringify(nextProfile) ||
                  JSON.stringify(old.terms) !== JSON.stringify(terms);
                if (
                  !changed &&
                  (old.firstDayNotes || '') === firstDayNotes.trim()
                )
                  return old;
                return {
                  ...old,
                  profile: nextProfile,
                  terms,
                  firstDayNotes: firstDayNotes.trim(),
                  offerPrepared: true,
                  ...(changed
                    ? {
                        saved: false,
                        reviewed: false,
                        document: null,
                        employerReviewed: false,
                      }
                    : {}),
                  tasks:
                    old.profile.startDate !== nextProfile.startDate
                      ? (old.tasks || []).map((task) =>
                          task.relativeToStart
                            ? { ...task, dueDate: nextProfile.startDate }
                            : task,
                        )
                      : old.tasks,
                  activity: [
                    ...(old.activity || []),
                    {
                      id: caseId(),
                      at: new Date().toISOString(),
                      actor: role,
                      action: changed
                        ? 'Prepared hire details updated; previous review and signature reset'
                        : 'First-day instructions saved',
                    },
                  ].slice(-100),
                };
              });
            } else {
              createCase(nextProfile, terms);
              setDraft((old) => ({
                ...old,
                firstDayNotes: firstDayNotes.trim(),
              }));
            }
            setCreating(false);
            setError('');
            setNotice(
              editing
                ? hireChanged
                  ? 'Hire details updated. The employee needs to confirm the changes.'
                  : 'First-day instructions saved. Confirmed details and signatures are unchanged.'
                : 'Employee record created. The employee can confirm the prefilled details.',
            );
          }}
        >
          <div className='ew-fields'>
            {fields.map(([key, label, type]) => (
              <label key={key}>
                {label}
                <input
                  type={type}
                  required
                  value={profile[key]}
                  onChange={(event) =>
                    setProfile((old) => ({ ...old, [key]: event.target.value }))
                  }
                />
              </label>
            ))}
            <label>
              Company
              <input
                required
                value={company}
                onChange={(event) => setCompany(event.target.value)}
              />
            </label>
            <label>
              {editing
                ? `Pay amount (${draft.terms.currency}, ${draft.terms.basis})`
                : 'Annual salary (AUD)'}
              <input
                required
                type='number'
                min='1'
                step='0.01'
                value={salary}
                onChange={(event) => setSalary(event.target.value)}
              />
            </label>
          </div>
          <details>
            <summary>First-day instructions (optional)</summary>
            <label className='fd-field'>
              Arrival and contact details
              <textarea
                value={firstDayNotes}
                maxLength={1500}
                rows={3}
                onChange={(event) => setFirstDayNotes(event.target.value)}
              />
            </label>
          </details>
          <p className='ew-muted'>
            The employee supplies any missing personal details. This does not
            mark their onboarding as complete.
          </p>
          <button className='ob-button primary' type='submit'>
            {editing ? 'Save hire changes' : 'Create employee record'}
          </button>
          <button
            type='button'
            className='ob-button secondary'
            onClick={() => {
              setCreating(false);
              setEditing(false);
              setError('');
            }}
          >
            Cancel
          </button>
        </form>
      )}
      {!records.length && !creating && (
        <p>
          No employee records yet. Add an employee to prepare their onboarding.
        </p>
      )}
      <ul className='ew-task-list fd-record-list'>
        {records.map((record) => (
          <li key={record.id}>
            <div>
              <b>{record.draft.profile.legalName}</b>
              <small>
                {record.draft.profile.role} · {record.draft.profile.startDate} ·{' '}
                {record.draft.employerReviewed
                  ? 'Reviewed'
                  : record.draft.document?.signature
                    ? outstandingAssignments(
                        record.draft.tasks || [],
                        policies,
                        record.draft.policyAcknowledgements || [],
                      ).length
                      ? 'Tasks outstanding'
                      : 'Awaiting Admin review'
                    : 'In progress'}
              </small>
            </div>
            <button
              className='ob-button secondary'
              aria-pressed={draft.caseId === record.id}
              aria-label={`Open ${record.draft.profile.legalName}`}
              onClick={() => selectCase(record.id)}
            >
              {draft.caseId === record.id ? 'Selected' : 'Open'}
            </button>
          </li>
        ))}
      </ul>
      {draft.caseId && (
        <div className='ew-actions'>
          {role === 'admin' && (
            <button
              className='ob-button secondary'
              onClick={() => {
                setEditing(true);
                setEditingCase(draft.caseId);
                setCreating(true);
                setProfile({ ...draft.profile });
                setCompany(draft.terms.company);
                setSalary(draft.terms.amount);
                setFirstDayNotes(draft.firstDayNotes || '');
                setError('');
              }}
            >
              Edit hire details
            </button>
          )}
          {onEmployee && (
            <button className='ob-button secondary' onClick={onEmployee}>
              Open employee onboarding
            </button>
          )}
          <button
            className='ob-button secondary'
            onClick={() => {
              const selectedCase = draft.caseId;
              const url = new URL(window.location.href);
              url.searchParams.set('previewRole', 'employee');
              url.searchParams.set('case', draft.caseId!);
              if (!navigator.clipboard?.writeText) {
                setError(
                  'Clipboard unavailable. Open the employee view in this browser.',
                );
                return;
              }
              void navigator.clipboard
                .writeText(url.href)
                .then(() => {
                  setDraft((old) => ({
                    ...old,
                    ...(old.caseId === selectedCase
                      ? { invitedAt: new Date().toISOString() }
                      : {}),
                  }));
                  setNotice(
                    `Demo invitation for ${draft.profile.legalName} copied. It opens only in this browser and account; no email was sent.`,
                  );
                })
                .catch(() =>
                  setError('The invitation link could not be copied.'),
                );
            }}
          >
            Copy demo invitation link
          </button>
        </div>
      )}
      {role === 'admin' && (
        <details>
          <summary>Company policies</summary>
          <p>
            Add the actual document and its version. Employees acknowledge that
            version.
          </p>
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (
                !policyFile ||
                policyFile.type !== 'application/pdf' ||
                policyFile.size > 10 * 1024 * 1024 ||
                !title.trim() ||
                !version.trim()
              ) {
                setError('Add a policy title, version and PDF up to 10 MB.');
                return;
              }
              if (
                policies.some(
                  (item) =>
                    item.title.toLowerCase() === title.trim().toLowerCase() &&
                    item.version === version.trim(),
                )
              ) {
                setError('Use a new version when replacing a policy.');
                return;
              }
              addPolicy({
                id: caseId(),
                title: title.trim(),
                version: version.trim(),
                file: policyFile,
              });
              setTitle('');
              setVersion('');
              setPolicyFile(null);
              if (policyInput.current) policyInput.current.value = '';
              setError('');
              setNotice('Policy added to this local walkthrough.');
            }}
          >
            <div className='ew-fields'>
              <label>
                Policy title
                <input
                  value={title}
                  required
                  onChange={(event) => setTitle(event.target.value)}
                />
              </label>
              <label>
                Policy version
                <input
                  value={version}
                  required
                  onChange={(event) => setVersion(event.target.value)}
                />
              </label>
              <label>
                Policy PDF
                <input
                  type='file'
                  accept='application/pdf'
                  ref={policyInput}
                  onChange={(event) =>
                    setPolicyFile(event.target.files?.[0] || null)
                  }
                />
              </label>
            </div>
            <button className='ob-button secondary'>Add policy</button>
          </form>
          <ul>
            {policies.map((policy) => (
              <li key={policy.id}>
                {policy.title} · Version {policy.version}
              </li>
            ))}
          </ul>
        </details>
      )}
    </section>
  );
}

function PolicyItem({ policy }: { policy: CompanyPolicy }): ReactNode {
  const { draft, setDraft } = useSessionDraft();
  const [url, setUrl] = useState('');
  const [opened, setOpened] = useState(false);
  const acknowledged = policyRead(policy, draft.policyAcknowledgements || []);
  useEffect(() => {
    const objectUrl = URL.createObjectURL(policy.file);
    setUrl(objectUrl);
    setOpened(false);
    return () => URL.revokeObjectURL(objectUrl);
  }, [policy.file, policy.version]);
  return (
    <li>
      <div>
        <b>{policy.title}</b>
        <small>Version {policy.version}</small>
        <a
          href={url || undefined}
          target='_blank'
          rel='noopener noreferrer'
          onClick={() => {
            if (url) setOpened(true);
          }}
        >
          Read document (new tab)
        </a>
      </div>
      {acknowledged ? (
        <span>Read and acknowledged</span>
      ) : (
        <button
          className='ob-button secondary'
          disabled={!opened || !draft.caseId}
          onClick={() =>
            setDraft((old) => ({
              ...old,
              policyAcknowledgements: [
                ...(old.policyAcknowledgements || []).filter(
                  (item) => item.policyId !== policy.id,
                ),
                {
                  policyId: policy.id,
                  version: policy.version,
                  acknowledgedAt: new Date().toISOString(),
                },
              ],
            }))
          }
        >
          I have read and acknowledge this policy
        </button>
      )}
    </li>
  );
}

export function AssignedOnboarding({
  role,
}: {
  role: WorkspaceRole;
}): ReactNode {
  const { draft, setDraft, policies } = useSessionDraft();
  const [taskTitle, setTaskTitle] = useState('');
  const [owner, setOwner] = useState<WorkspaceRole>('employee');
  const [due, setDue] = useState('');
  const [taskError, setTaskError] = useState('');
  useEffect(() => {
    setTaskTitle('');
    setOwner('employee');
    setDue('');
    setTaskError('');
  }, [draft.caseId]);
  const tasks = draft.tasks || [];
  if (!draft.caseId) return null;
  const overdue = tasks.filter(isOverdue).length;
  return (
    <>
      <section className='ew-card'>
        <h2>First-day tasks</h2>
        {overdue > 0 && (
          <p className='fd-alert warning' role='status'>
            {overdue} task{overdue === 1 ? ' is' : 's are'} overdue. Follow up
            with the person responsible.
          </p>
        )}
        <ul className='ew-task-list'>
          {tasks.map((task) => (
            <li key={task.id}>
              <label className='fd-checkbox'>
                <input
                  type='checkbox'
                  checked={Boolean(task.completedAt)}
                  disabled={role !== 'admin' && task.owner !== role}
                  onChange={(event) =>
                    setDraft((old) => ({
                      ...old,
                      employerReviewed: false,
                      tasks: (old.tasks || []).map((item) =>
                        item.id === task.id
                          ? {
                              ...item,
                              completedAt: event.target.checked
                                ? new Date().toISOString()
                                : undefined,
                            }
                          : item,
                      ),
                    }))
                  }
                />
                <span>
                  <b>{task.title}</b>
                  <small>
                    {task.owner.charAt(0).toUpperCase() + task.owner.slice(1)} ·
                    Due {task.dueDate || 'not set'}
                    {isOverdue(task) ? ' · Overdue' : ''}
                  </small>
                </span>
              </label>
            </li>
          ))}
        </ul>
        {role !== 'employee' && (
          <details>
            <summary>Add a task</summary>
            {taskError && <p role='alert'>{taskError}</p>}
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (!taskTitle.trim() || !validDate(due)) {
                  setTaskError('Enter a task and valid due date.');
                  return;
                }
                setTaskError('');
                setDraft((old) => ({
                  ...old,
                  employerReviewed: false,
                  tasks: [
                    ...(old.tasks || []),
                    {
                      id: caseId(),
                      title: taskTitle.trim(),
                      owner,
                      dueDate: due,
                    },
                  ],
                }));
                setTaskTitle('');
              }}
            >
              <div className='ew-fields'>
                <label>
                  Task
                  <input
                    required
                    maxLength={150}
                    value={taskTitle}
                    onChange={(event) => setTaskTitle(event.target.value)}
                  />
                </label>
                <label>
                  Responsible person
                  <select
                    value={owner}
                    onChange={(event) =>
                      setOwner(event.target.value as WorkspaceRole)
                    }
                  >
                    <option value='employee'>Employee</option>
                    <option value='admin'>Admin</option>
                  </select>
                </label>
                <label>
                  Due date
                  <input
                    type='date'
                    required
                    value={due}
                    onChange={(event) => setDue(event.target.value)}
                  />
                </label>
              </div>
              <button className='ob-button secondary'>Add task</button>
            </form>
          </details>
        )}
      </section>
      {role === 'employee' && policies.length > 0 && (
        <section className='ew-card'>
          <h2>Read and acknowledge</h2>
          <ul className='ew-task-list'>
            {policies.map((policy) => (
              <PolicyItem
                key={`${policy.id}-${policy.version}`}
                policy={policy}
              />
            ))}
          </ul>
        </section>
      )}
      <details className='ew-card'>
        <summary>Activity history</summary>
        <p className='ew-muted'>
          Local walkthrough activity. Hosted audit records are not connected.
        </p>
        <ul>
          {[...(draft.activity || [])]
            .reverse()
            .slice(0, 20)
            .map((entry) => (
              <li key={entry.id}>
                <b>{entry.action}</b> · {entry.actor} ·{' '}
                <time dateTime={entry.at}>
                  {new Date(entry.at).toLocaleString()}
                </time>
              </li>
            ))}
        </ul>
      </details>
    </>
  );
}
