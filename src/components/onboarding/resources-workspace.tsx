'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession } from 'next-auth/react';
import {
  ArrowLeft,
  CheckCircle2,
  Download,
  FileCheck2,
  FileText,
  XCircle,
} from 'lucide-react';
import {
  DOCUMENTS,
  EMPTY_EMPLOYEE,
  verifyDocument,
  type Employee,
} from '@/lib/onboarding/core';
import { draftAi, reviewAi, type AiRuntime } from '@/lib/onboarding/ai';
import {
  downloadPdf,
  generateCheckedDocument,
  generateDocument,
  readDocument,
} from '@/lib/onboarding/files';
import type { WorkspaceRole } from '@/lib/onboarding/roles';
import { useResourceField, useSessionDraft } from './session-draft';
import { WorkspaceShell } from './workspace-shell';

interface Props {
  role: WorkspaceRole;
  onChangeRole: () => void;
  onBack: () => void;
  preview: boolean;
  runtime: AiRuntime | null;
  embedded?: boolean;
}
const nav = [
  { id: 'templates', label: 'Forms', Icon: FileText },
  { id: 'check', label: 'Check checklist', Icon: FileCheck2 },
];

export function ResourcesWorkspace({
  role,
  onChangeRole,
  onBack,
  preview,
  runtime,
  embedded = false,
}: Props): ReactNode {
  const { draft } = useSessionDraft();
  const { data: session, status } = useSession();
  const [page, setPage] = useResourceField('page');
  const [storedKind, setKind] = useResourceField('kind');
  const templates = DOCUMENTS.filter(
    (item) => role !== 'employee' || ['checklist', 'deposit'].includes(item.id),
  );
  const kind =
    role === 'employee' && !['checklist', 'deposit'].includes(storedKind)
      ? 'checklist'
      : storedKind;
  const [ai, setAi] = useState(false);
  const [consent, setConsent] = useState(false);
  const [equipment, setEquipment] = useResourceField('equipment');
  const [login, setLogin] = useResourceField('login');
  const [file, setFile] = useResourceField('file');
  const [result, setResult] = useResourceField('result');
  const [method, setMethod] = useResourceField('method');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const filePicker = useRef<HTMLInputElement>(null);
  const aiReady = runtime?.configured === true && status === 'authenticated';
  const returnLabel = role === 'admin' ? 'Back to Settings' : 'Back to Home';
  const employee: Employee = {
    ...EMPTY_EMPLOYEE,
    name: draft.profile.legalName,
    email: draft.profile.email,
    department: draft.profile.department,
    role: draft.profile.role,
    manager: draft.profile.manager,
    startDate: draft.profile.startDate,
    equipment,
    login,
    temporaryPassword: '',
  };
  const missing = (
    ['name', 'department', 'role', 'manager', 'startDate'] as const
  ).filter((key) => !employee[key].trim());
  const labels = {
    name: 'employee name',
    department: 'department',
    role: 'job title',
    manager: 'manager',
    startDate: 'start date',
  };
  useEffect(
    () => () => {
      request.current++;
    },
    [],
  );
  useEffect(() => {
    request.current++;
    setBusy('');
    setError('');
    setNotice('');
    setAi(false);
    setConsent(false);
  }, [session?.user?.id, role]);
  const navigate = (next: string): void => {
    request.current++;
    setBusy('');
    setPage(next);
    setError('');
    setNotice('');
    setAi(false);
    setConsent(false);
  };
  const generate = async (): Promise<void> => {
    if (busy) return;
    setError('');
    setNotice('');
    if (kind !== 'deposit' && missing.length) {
      setError(
        `Complete ${missing.map((key) => labels[key]).join(', ')} in onboarding before generating this document.`,
      );
      return;
    }
    const useAi = kind !== 'deposit' && ai;
    if (useAi && (!aiReady || !runtime || !consent)) {
      setError(
        'Sign in, connect AI and agree to send these details before using an AI draft.',
      );
      return;
    }
    const active = ++request.current;
    setBusy('generate');
    try {
      const generated =
        useAi && runtime
          ? await draftAi(kind, employee, [], runtime)
          : undefined;
      const bytes = await generateDocument(kind, employee, generated);
      if (active !== request.current) return;
      downloadPdf(
        bytes,
        `${kind}-${kind === 'deposit' ? 'blank' : employee.name.replace(/[^a-z0-9]+/gi, '-')}.pdf`,
      );
      setNotice(
        `${DOCUMENTS.find((item) => item.id === kind)?.title} downloaded. Review the PDF before sharing.`,
      );
    } catch (failure) {
      if (active === request.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The PDF could not be created. Try again.',
        );
    } finally {
      if (active === request.current) setBusy('');
    }
  };
  const check = async (): Promise<void> => {
    if (!file || busy) return;
    setResult(null);
    setError('');
    setNotice('');
    if (ai && (!aiReady || !runtime || !consent)) {
      setError(
        'Sign in, connect AI and agree to send this document text before an AI review.',
      );
      return;
    }
    const active = ++request.current;
    setBusy('check');
    try {
      const text = await readDocument(file);
      const checked =
        ai && runtime
          ? await reviewAi(text, file.name, runtime)
          : verifyDocument(text, file.name);
      if (active !== request.current) return;
      setResult(checked);
      setMethod(
        ai ? 'EAI assisted completeness review' : 'Local required-field check',
      );
    } catch (failure) {
      if (active === request.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The document could not be checked. Choose a readable file and try again.',
        );
    } finally {
      if (active === request.current) setBusy('');
    }
  };
  const downloadCheck = async (): Promise<void> => {
    if (!result || busy) return;
    const active = ++request.current;
    setBusy('download');
    setError('');
    try {
      const bytes = await generateCheckedDocument(result, file || undefined);
      if (active === request.current) {
        downloadPdf(
          bytes,
          `checked-${result.filename.replace(/\.[^.]+$/, '')}.pdf`,
        );
        setNotice(
          'Checked report downloaded with its timestamp and source document.',
        );
      }
    } catch (failure) {
      if (active === request.current)
        setError(
          failure instanceof Error
            ? failure.message
            : 'The report could not be downloaded. Try again.',
        );
    } finally {
      if (active === request.current) setBusy('');
    }
  };
  const content = (
    <>
      {embedded ? (
        <div className='fd-tabs' role='group' aria-label='Form tools'>
          {nav.map(({ id, label }) => (
            <button
              type='button'
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => navigate(id)}
            >
              {id === 'templates' ? 'Generate forms' : label}
            </button>
          ))}
        </div>
      ) : (
        <button className='fd-text-button' onClick={onBack}>
          <ArrowLeft size={16} aria-hidden='true' />
          {returnLabel}
        </button>
      )}
      <div className='fd-page-heading'>
        <div>
          <h1>{page === 'templates' ? 'Forms' : 'Check checklist'}</h1>
          <p>
            {page === 'templates'
              ? 'Download a PDF using the employee details already entered.'
              : 'Find missing fields in a completed checklist or form.'}
          </p>
        </div>
      </div>
      {error && (
        <div className='fd-alert danger' role='alert'>
          {error}
        </div>
      )}
      {notice && (
        <div className='fd-alert success' role='status'>
          {notice}
        </div>
      )}
      {page === 'templates' ? (
        <div className='fd-resource-grid'>
          <section className='fd-card fd-resource-tool'>
            <h2>Choose a template</h2>
            <div className='fd-resource-options'>
              {templates.map((item) => (
                <label
                  className={`fd-resource-option ${kind === item.id ? 'is-selected' : ''}`}
                  key={item.id}
                >
                  <input
                    type='radio'
                    name='template'
                    value={item.id}
                    checked={kind === item.id}
                    disabled={Boolean(busy)}
                    onChange={() => {
                      setKind(item.id);
                      setError('');
                      setNotice('');
                      setAi(false);
                      setConsent(false);
                    }}
                  />
                  <span>
                    <b>{item.title}</b>
                    <small>
                      {item.id === 'checklist'
                        ? 'A checklist based on the employee’s role.'
                        : item.id === 'welcome'
                          ? 'An email template for the new hire.'
                          : item.description}
                    </small>
                  </span>
                  <FileText size={20} aria-hidden='true' />
                </label>
              ))}
            </div>
          </section>
          <section className='fd-card fd-resource-tool'>
            <h2>
              {kind === 'deposit' ? 'Blank payroll form' : 'Document details'}
            </h2>
            {kind === 'deposit' ? (
              <p>
                The fillable PDF contains blank payroll fields. Fill it in and
                return it through your employer’s secure payroll channel.
              </p>
            ) : (
              <>
                <dl className='fd-details-list'>
                  <div>
                    <dt>Employee</dt>
                    <dd>{employee.name || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Job title / department</dt>
                    <dd>
                      {[employee.role, employee.department]
                        .filter(Boolean)
                        .join(' · ') || 'Not provided'}
                    </dd>
                  </div>
                  <div>
                    <dt>Manager</dt>
                    <dd>{employee.manager || 'Not provided'}</dd>
                  </div>
                  <div>
                    <dt>Start date</dt>
                    <dd>{employee.startDate || 'Not provided'}</dd>
                  </div>
                </dl>
                {missing.length > 0 && (
                  <p className='fd-muted'>
                    Add the missing employee details before downloading.{' '}
                    <button className='fd-text-button' onClick={onBack}>
                      {returnLabel}
                    </button>
                  </p>
                )}
                {kind === 'it' && (
                  <div className='fd-form-grid'>
                    <label>
                      Assigned login (optional)
                      <input
                        value={login}
                        maxLength={200}
                        autoComplete='off'
                        onChange={(event) => setLogin(event.target.value)}
                        placeholder='Supplied by IT'
                      />
                    </label>
                    <label>
                      Assigned equipment (optional)
                      <textarea
                        value={equipment}
                        maxLength={1500}
                        onChange={(event) => setEquipment(event.target.value)}
                        placeholder='Equipment and asset numbers supplied by IT'
                      />
                    </label>
                    <p className='fd-muted'>
                      Obtain passwords through your IT team’s approved channel.
                    </p>
                  </div>
                )}
              </>
            )}
            {kind !== 'deposit' && (
              <div className='fd-resource-ai'>
                <label className='fd-checkbox'>
                  <input
                    type='checkbox'
                    checked={ai}
                    disabled={!aiReady || Boolean(busy)}
                    onChange={(event) => {
                      setAi(event.target.checked);
                      setConsent(false);
                    }}
                  />
                  Use an EAI draft
                </label>
                <p className='fd-muted'>
                  {aiReady
                    ? 'Optional. The configured document workflow drafts content for your review.'
                    : 'Local templates work now. EAI drafts require sign-in and a configured document workflow.'}
                </p>
                {ai && (
                  <label className='fd-checkbox'>
                    <input
                      type='checkbox'
                      checked={consent}
                      onChange={(event) => setConsent(event.target.checked)}
                    />
                    I agree to send the document details to Enterprise AI for
                    drafting.
                  </label>
                )}
              </div>
            )}
            {kind !== 'deposit' && (
              <p className='fd-muted'>
                Standard templates are created locally. Confirm company
                requirements with HR.
              </p>
            )}
            <button
              className='fd-button primary'
              disabled={
                Boolean(busy) ||
                (kind !== 'deposit' && missing.length > 0) ||
                (kind !== 'deposit' && ai && !consent)
              }
              onClick={() => void generate()}
            >
              <Download size={17} aria-hidden='true' />
              {busy === 'generate' ? 'Creating PDF…' : 'Download PDF'}
            </button>
          </section>
        </div>
      ) : (
        <section className='fd-card fd-resource-tool'>
          <h2>Upload a completed checklist or form</h2>
          <p>
            PDF, Word (.docx), text or Markdown · up to 10 MB. Scanned images
            need text recognition first.
          </p>
          <label className='fd-file-control'>
            Completed checklist or form
            <input
              ref={filePicker}
              type='file'
              accept='.pdf,.docx,.txt,.md'
              disabled={Boolean(busy)}
              onChange={(event) => {
                request.current++;
                setFile(event.target.files?.[0] || null);
                setResult(null);
                setError('');
                setNotice('');
                setConsent(false);
              }}
            />
          </label>
          {file && (
            <div className='fd-resource-actions'>
              <p className='fd-muted'>
                Selected in this session: <strong>{file.name}</strong>
              </p>
              <button
                className='fd-text-button'
                disabled={Boolean(busy)}
                onClick={() => {
                  request.current++;
                  setFile(null);
                  setResult(null);
                  setMethod('');
                  setConsent(false);
                  setError('');
                  setNotice('');
                  if (filePicker.current) filePicker.current.value = '';
                }}
              >
                Remove document
              </button>
            </div>
          )}
          <div className='fd-resource-ai'>
            <label className='fd-checkbox'>
              <input
                type='checkbox'
                checked={ai}
                disabled={!aiReady || Boolean(busy)}
                onChange={(event) => {
                  setAi(event.target.checked);
                  setResult(null);
                  setConsent(false);
                }}
              />
              Use EAI for this review
            </label>
            <p className='fd-muted'>
              {aiReady
                ? 'Optional. Send readable document text to the configured review workflow.'
                : 'The local check looks for the seven required field labels. Sign in to use a configured EAI review.'}
            </p>
            {ai && (
              <label className='fd-checkbox'>
                <input
                  type='checkbox'
                  checked={consent}
                  onChange={(event) => setConsent(event.target.checked)}
                />
                I agree to send this document’s text to Enterprise AI for
                processing.
              </label>
            )}
          </div>
          <button
            className='fd-button primary'
            disabled={!file || Boolean(busy) || (ai && !consent)}
            onClick={() => void check()}
          >
            <FileCheck2 size={17} aria-hidden='true' />
            {busy === 'check' ? 'Checking…' : 'Check checklist'}
          </button>
          <p className='fd-muted'>
            This checks completeness. It does not verify identity or signatures,
            or approve onboarding.
          </p>
          {result && (
            <div className='fd-resource-result'>
              <div className='fd-section-heading'>
                <div>
                  <h2>
                    {result.passed
                      ? 'All required fields found'
                      : 'Some fields need attention'}
                  </h2>
                  <p>
                    {method} ·{' '}
                    {new Date(result.checkedAt).toLocaleString('en-AU')}
                  </p>
                </div>
                <span
                  className={`fd-badge ${result.passed ? 'success' : 'warning'}`}
                >
                  {result.passed ? 'Pass' : 'Needs attention'}
                </span>
              </div>
              <ul className='fd-check-findings'>
                {result.items.map((item) => (
                  <li key={item.key}>
                    {item.passed ? (
                      <CheckCircle2 size={19} aria-hidden='true' />
                    ) : (
                      <XCircle size={19} aria-hidden='true' />
                    )}
                    <div>
                      <b>
                        {item.label}
                        <span className='fd-sr-only'>
                          {item.passed ? ': complete' : ': incomplete'}
                        </span>
                      </b>
                      <p>{item.issue}</p>
                      {item.value && <small>{item.value}</small>}
                    </div>
                  </li>
                ))}
              </ul>
              <button
                className='fd-button secondary'
                disabled={Boolean(busy)}
                onClick={() => void downloadCheck()}
              >
                <Download size={17} aria-hidden='true' />
                {busy === 'download'
                  ? 'Creating report…'
                  : 'Download checked PDF'}
              </button>
            </div>
          )}
        </section>
      )}
    </>
  );
  return embedded ? (
    content
  ) : (
    <WorkspaceShell
      role={role}
      page={page}
      title={page === 'templates' ? 'Forms' : 'Check checklist'}
      navigation={nav}
      onNavigate={navigate}
      onChangeRole={onChangeRole}
      preview={preview}
    >
      {content}
    </WorkspaceShell>
  );
}
