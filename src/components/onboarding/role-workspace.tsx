'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import {
  ArrowRight,
  Check,
  ClipboardList,
  FileCheck2,
  Settings2,
  UsersRound,
} from 'lucide-react';
import type { WorkspaceRole } from '@/lib/onboarding/roles';
import {
  profileIssues,
  salaryLabel,
  termsIssues,
  type EmployeeProfile,
  type EmploymentTerms,
} from '@/lib/onboarding/employee-workflow';
import { SUPPORTING_DOCUMENT_TYPES } from '@/lib/onboarding/document-catalog';
import { IdentityDocumentReview } from './identity-document-review';
import { useSessionDraft } from './session-draft';
import { WorkspaceShell } from './workspace-shell';
import { CaseRecords, AssignedOnboarding } from './case-records';
import { policyRead, outstandingAssignments } from '@/lib/onboarding/cases';

interface Props {
  role: Exclude<WorkspaceRole, 'employee'>;
  preview?: boolean;
  onChangeRole: () => void;
  onPreviewEmployee?: () => void;
}
interface ServiceStatus {
  chat: boolean;
  documents: boolean;
}
const ADMIN_PORTAL = 'https://admin-portal.myenterprise.ai/';
const basics: ReadonlyArray<[keyof EmployeeProfile, string, string]> = [
  ['legalName', 'Employee legal name', 'text'],
  ['email', 'Employee email', 'email'],
  ['department', 'Department', 'text'],
  ['role', 'Job title', 'text'],
  ['manager', 'Manager', 'text'],
  ['startDate', 'Start date', 'date'],
];

function basicIssues(profile: EmployeeProfile): string[] {
  const errors = basics
    .filter(([key]) => !profile[key].trim())
    .map(([, label]) => `${label} is required.`);
  if (profile.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email))
    errors.push('Enter a valid employee email address.');
  if (
    profile.startDate &&
    (!/^\d{4}-\d{2}-\d{2}$/.test(profile.startDate) ||
      !Number.isFinite(Date.parse(profile.startDate)) ||
      new Date(profile.startDate).toISOString().slice(0, 10) !==
        profile.startDate)
  )
    errors.push('Enter a valid start date.');
  return errors;
}

export function RoleWorkspace({
  role,
  preview = false,
  onChangeRole,
  onPreviewEmployee,
}: Props): ReactNode {
  const { draft, setDraft, policies, createCase } = useSessionDraft();
  const [page, setPage] = useState('overview');
  const [issues, setIssues] = useState<string[]>([]);
  const [notice, setNotice] = useState('');
  const [reason, setReason] = useState('');
  const [reviewConsent, setReviewConsent] = useState(false);
  const [services, setServices] = useState<ServiceStatus | null>(null);
  const [configState, setConfigState] = useState<'loading' | 'ready' | 'error'>(
    'loading',
  );
  const [refresh, setRefresh] = useState(0);
  const errorsRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const currentSignature =
    draft.document?.signature &&
    JSON.stringify(draft.document.profile) === JSON.stringify(draft.profile) &&
    JSON.stringify(draft.document.terms) === JSON.stringify(draft.terms);
  const ready =
    draft.offerPrepared &&
    draft.saved &&
    draft.reviewed &&
    draft.identity &&
    draft.analysis?.status === 'review' &&
    Boolean(currentSignature) &&
    !draft.correction &&
    !profileIssues(draft.profile).length &&
    !termsIssues(draft.terms).length &&
    (draft.tasks || []).every((task) => Boolean(task.completedAt)) &&
    policies.every((policy) =>
      policyRead(policy, draft.policyAcknowledgements || []),
    );
  useEffect(() => {
    if (issues.length) errorsRef.current?.focus();
  }, [issues]);
  useEffect(() => {
    headingRef.current?.focus();
  }, [page]);
  useEffect(() => {
    setReviewConsent(false);
  }, [
    draft.caseId,
    draft.document,
    draft.reviewed,
    draft.saved,
    draft.tasks,
    policies,
  ]);
  useEffect(() => {
    setReason('');
    setNotice('');
    setIssues([]);
  }, [draft.caseId]);
  useEffect(() => {
    if (role !== 'admin') return;
    const controller = new AbortController();
    setConfigState('loading');
    fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_PATH || ''}/api/onboarding/config`,
      { signal: controller.signal },
    )
      .then(async (response) => {
        if (!response.ok) throw new Error('Configuration request failed.');
        return response.json();
      })
      .then((config: unknown) => {
        if (controller.signal.aborted) return;
        if (
          !config ||
          typeof config !== 'object' ||
          !('configured' in config) ||
          typeof config.configured !== 'boolean'
        )
          throw new Error('Unreadable configuration.');
        const documents = 'documents' in config ? config.documents : null;
        setServices({
          chat: config.configured,
          documents: Boolean(
            documents &&
            typeof documents === 'object' &&
            'configured' in documents &&
            documents.configured === true,
          ),
        });
        setConfigState('ready');
      })
      .catch(() => {
        if (!controller.signal.aborted) {
          setConfigState('error');
          setServices(null);
        }
      });
    return () => controller.abort();
  }, [role, refresh]);

  function navigate(next: string): void {
    setIssues([]);
    setNotice('');
    setPage(next);
  }
  function updateBasic(key: keyof EmployeeProfile, value: string): void {
    setIssues([]);
    setNotice('');
    setDraft((old) =>
      old.profile[key] === value
        ? old
        : {
            ...old,
            profile: { ...old.profile, [key]: value },
            tasks:
              key === 'startDate'
                ? (old.tasks || []).map((task) =>
                    task.relativeToStart ? { ...task, dueDate: value } : task,
                  )
                : old.tasks,
            offerPrepared: false,
            saved: false,
            reviewed: false,
            document: null,
            employerReviewed: false,
          },
    );
  }
  function updateTerm(key: keyof EmploymentTerms, value: string): void {
    setIssues([]);
    setNotice('');
    setDraft((old) =>
      old.terms[key] === value
        ? old
        : {
            ...old,
            terms: { ...old.terms, [key]: value },
            offerPrepared: false,
            document: null,
            employerReviewed: false,
          },
    );
  }
  function saveBasics(): void {
    const errors = basicIssues(draft.profile);
    setIssues(errors);
    if (errors.length) return;
    setNotice('Hire details saved. Add or review the pay terms.');
  }
  function saveOffer(): void {
    const errors = [...basicIssues(draft.profile), ...termsIssues(draft.terms)];
    setIssues(errors);
    if (errors.length) return;
    if (!draft.caseId) createCase(draft.profile, draft.terms);
    setDraft((old) => ({
      ...old,
      offerPrepared: true,
      employerReviewed: false,
    }));
    setNotice('Offer saved. Open Employee to continue this demo.');
  }
  function requestCorrection(): void {
    if (!reason.trim()) {
      setIssues(['Describe what the employee needs to correct.']);
      return;
    }
    setDraft((old) => ({
      ...old,
      correction: reason.trim(),
      reviewed: false,
      document: null,
      employerReviewed: false,
    }));
    setReason('');
    setReviewConsent(false);
    setIssues([]);
    setNotice('Correction requested. The employee will see your note.');
  }

  const navigation = [
    { id: 'overview', label: 'Employees', Icon: UsersRound },
    ...(preview
      ? [
          { id: 'hire', label: 'Hire details', Icon: UsersRound },
          { id: 'pay', label: 'Pay terms', Icon: ClipboardList },
          { id: 'review', label: 'Review onboarding', Icon: FileCheck2 },
        ]
      : []),
    { id: 'settings', label: 'Settings', Icon: Settings2 },
  ];
  const title =
    navigation.find((item) => item.id === page)?.label || 'Overview';
  return (
    <WorkspaceShell
      role={role}
      page={page}
      title={title}
      navigation={navigation}
      onNavigate={navigate}
      onChangeRole={onChangeRole}
      preview={preview}
    >
      <>
        <div className='fd-page-heading'>
          <h1 ref={headingRef} tabIndex={-1}>
            {title}
          </h1>
        </div>
        {!!issues.length && (
          <div
            ref={errorsRef}
            tabIndex={-1}
            className='ob-notice error'
            role='alert'
          >
            <b>Please check the following</b>
            <ul>
              {issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          </div>
        )}
        {notice && (
          <p className='ob-notice' role='status'>
            {notice}
          </p>
        )}
        {preview && page === 'overview' && <CaseRecords role='admin' />}
        {page !== 'settings' &&
          (!preview ? (
            <section className='ew-card fd-empty-state'>
              <UsersRound size={28} aria-hidden='true' />
              <h2>Shared onboarding cases are not connected yet</h2>
              <p>
                Shared hire records and assigned reviewers are not connected.
                Hire preparation and review are currently available in the local
                demo at localhost.
              </p>
              <button className='ob-button primary' onClick={onChangeRole}>
                Change role
              </button>
            </section>
          ) : (
            <>
              {page === 'overview' && (
                <>
                  <section className='ew-card fd-hire-card'>
                    <div className='fd-section-heading'>
                      <div>
                        <h2>
                          {draft.profile.legalName || 'Prepare your first hire'}
                        </h2>
                        <p>
                          {draft.profile.role ||
                            'Add their details and pay terms.'}
                          {draft.profile.department
                            ? ` · ${draft.profile.department}`
                            : ''}
                        </p>
                      </div>
                      <span className='fd-status-badge'>
                        {draft.employerReviewed
                          ? 'Locally acknowledged'
                          : draft.correction
                            ? 'Correction requested'
                            : draft.document?.signature
                              ? ready
                                ? 'Ready for your review'
                                : 'Tasks or review outstanding'
                              : draft.offerPrepared
                                ? 'Employee onboarding'
                                : 'Offer not prepared'}
                      </span>
                    </div>
                    {draft.offerPrepared && (
                      <dl className='ew-summary'>
                        <div>
                          <dt>Start date</dt>
                          <dd>{draft.profile.startDate}</dd>
                        </div>
                        <div>
                          <dt>Manager</dt>
                          <dd>{draft.profile.manager}</dd>
                        </div>
                        <div>
                          <dt>Pay</dt>
                          <dd>{salaryLabel(draft.terms)}</dd>
                        </div>
                      </dl>
                    )}
                    <div className='ew-actions'>
                      <button
                        className='ob-button primary'
                        onClick={() => {
                          navigate('hire');
                        }}
                      >
                        Hire details
                        <ArrowRight size={16} />
                      </button>
                      <button
                        className='ob-button secondary'
                        onClick={() => navigate('pay')}
                      >
                        Pay terms
                      </button>
                      {draft.offerPrepared && (
                        <button
                          className='ob-button secondary'
                          onClick={() => navigate('review')}
                        >
                          Review progress
                        </button>
                      )}
                      {preview && draft.offerPrepared && onPreviewEmployee && (
                        <button
                          className='ob-button secondary'
                          onClick={onPreviewEmployee}
                        >
                          Open employee view
                        </button>
                      )}
                    </div>
                  </section>
                  <AssignedOnboarding role='admin' />
                  {!draft.caseId && (
                    <section className='ew-card'>
                      <h2>Onboarding progress</h2>
                      <Progress
                        prepared={draft.offerPrepared}
                        saved={draft.saved}
                        reviewed={draft.reviewed}
                        signed={Boolean(draft.document?.signature)}
                        completed={draft.employerReviewed}
                      />
                      <p className='ew-muted'>
                        Opening Employee continues this demo in the same tab. No
                        invitation is sent.
                      </p>
                    </section>
                  )}
                </>
              )}
              {page === 'hire' && (
                <section className='ew-card'>
                  <h2>Who is joining your team?</h2>
                  <p className='ew-muted'>
                    Changes reset document review, salary signatures and
                    completion acknowledgement.
                  </p>
                  <form
                    noValidate
                    onSubmit={(event) => {
                      event.preventDefault();
                      saveBasics();
                    }}
                  >
                    <div className='ew-fields'>
                      {basics.map(([key, label, type]) => (
                        <label key={key} htmlFor={`hire-${key}`}>
                          {label}
                          <input
                            id={`hire-${key}`}
                            type={type}
                            value={draft.profile[key]}
                            required
                            autoComplete={
                              key === 'legalName'
                                ? 'name'
                                : key === 'email'
                                  ? 'email'
                                  : 'off'
                            }
                            onChange={(event) =>
                              updateBasic(key, event.target.value)
                            }
                          />
                        </label>
                      ))}
                    </div>
                    <div className='ew-actions'>
                      <button className='ob-button primary' type='submit'>
                        Save hire details
                      </button>
                      <button
                        className='ob-button secondary'
                        type='button'
                        onClick={() => navigate('pay')}
                      >
                        Open pay terms
                      </button>
                    </div>
                  </form>
                </section>
              )}
              {page === 'pay' && (
                <>
                  <section className='ew-card'>
                    <h2>Employment offer</h2>
                    <span className='fd-status-badge'>
                      {draft.offerPrepared ? 'Offer saved' : 'Unsaved offer'}
                    </span>
                    <dl className='ew-summary'>
                      <div>
                        <dt>Employee</dt>
                        <dd>
                          {draft.profile.legalName} · {draft.profile.email}
                        </dd>
                      </div>
                      <div>
                        <dt>Role</dt>
                        <dd>
                          {draft.profile.role} · {draft.profile.department}
                        </dd>
                      </div>
                      <div>
                        <dt>Manager / start</dt>
                        <dd>
                          {draft.profile.manager} · {draft.profile.startDate}
                        </dd>
                      </div>
                      <div>
                        <dt>Employer</dt>
                        <dd>{draft.terms.company}</dd>
                      </div>
                      <div>
                        <dt>Pay</dt>
                        <dd>
                          {salaryLabel(draft.terms)} ·{' '}
                          {draft.terms.payFrequency}
                        </dd>
                      </div>
                      <div>
                        <dt>Employment</dt>
                        <dd>
                          {draft.terms.employmentType} · {draft.terms.hours}{' '}
                          hours per week
                        </dd>
                      </div>
                      <div>
                        <dt>Superannuation / pension</dt>
                        <dd>{draft.terms.retirement}</dd>
                      </div>
                    </dl>
                    {basicIssues(draft.profile).length > 0 && (
                      <div className='fd-alert'>
                        <p>
                          Add the employee’s hire details before saving an
                          offer. You can enter pay terms now.
                        </p>
                        <button
                          className='ob-button secondary'
                          onClick={() => navigate('hire')}
                        >
                          Go to hire details
                        </button>
                      </div>
                    )}
                  </section>
                  <section className='ew-card'>
                    <h2>Employment and pay terms</h2>
                    <p className='ew-muted'>
                      Pay changes clear the employee’s salary signature and
                      completion acknowledgement.
                    </p>
                    <form
                      noValidate
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveOffer();
                      }}
                    >
                      <div className='ew-fields'>
                        <label htmlFor='hire-company'>
                          Employer name
                          <input
                            id='hire-company'
                            autoComplete='organization'
                            value={draft.terms.company}
                            onChange={(event) =>
                              updateTerm('company', event.target.value)
                            }
                          />
                        </label>
                        <label htmlFor='hire-employment'>
                          Employment type
                          <select
                            id='hire-employment'
                            value={draft.terms.employmentType}
                            onChange={(event) =>
                              updateTerm('employmentType', event.target.value)
                            }
                          >
                            {[
                              'Full-time',
                              'Part-time',
                              'Casual',
                              'Fixed-term',
                            ].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                        <label htmlFor='hire-amount'>
                          Gross pay amount
                          <input
                            id='hire-amount'
                            type='number'
                            min='0.01'
                            step='0.01'
                            value={draft.terms.amount}
                            onChange={(event) =>
                              updateTerm('amount', event.target.value)
                            }
                          />
                        </label>
                        <label htmlFor='hire-currency'>
                          Currency
                          <select
                            id='hire-currency'
                            value={draft.terms.currency}
                            onChange={(event) =>
                              updateTerm('currency', event.target.value)
                            }
                          >
                            {['AUD', 'NZD', 'GBP', 'USD', 'CAD', 'EUR'].map(
                              (value) => (
                                <option key={value}>{value}</option>
                              ),
                            )}
                          </select>
                        </label>
                        <label htmlFor='hire-basis'>
                          Pay basis
                          <select
                            id='hire-basis'
                            value={draft.terms.basis}
                            onChange={(event) =>
                              updateTerm('basis', event.target.value)
                            }
                          >
                            {['per year', 'per hour'].map((value) => (
                              <option key={value}>{value}</option>
                            ))}
                          </select>
                        </label>
                        <label htmlFor='hire-hours'>
                          Hours per week
                          <input
                            id='hire-hours'
                            type='number'
                            min='0.1'
                            max='168'
                            step='0.1'
                            value={draft.terms.hours}
                            onChange={(event) =>
                              updateTerm('hours', event.target.value)
                            }
                          />
                        </label>
                        <label htmlFor='hire-retirement'>
                          Superannuation / pension treatment
                          <input
                            id='hire-retirement'
                            value={draft.terms.retirement}
                            onChange={(event) =>
                              updateTerm('retirement', event.target.value)
                            }
                          />
                        </label>
                        <label htmlFor='hire-frequency'>
                          Pay frequency
                          <select
                            id='hire-frequency'
                            value={draft.terms.payFrequency}
                            onChange={(event) =>
                              updateTerm('payFrequency', event.target.value)
                            }
                          >
                            {['Weekly', 'Fortnightly', 'Monthly'].map(
                              (value) => (
                                <option key={value}>{value}</option>
                              ),
                            )}
                          </select>
                        </label>
                      </div>
                      <p className='ew-muted'>
                        Saved terms appear in Employee. No invitation is sent.
                      </p>
                      <div className='ew-actions'>
                        <button className='ob-button primary' type='submit'>
                          Save prepared offer
                        </button>
                        {draft.offerPrepared && onPreviewEmployee && (
                          <button
                            className='ob-button secondary'
                            type='button'
                            onClick={onPreviewEmployee}
                          >
                            Open employee view
                          </button>
                        )}
                      </div>
                    </form>
                  </section>
                </>
              )}
              {page === 'review' && (
                <>
                  <section className='ew-card'>
                    <h2>
                      {draft.profile.legalName
                        ? `${draft.profile.legalName}'s onboarding`
                        : 'No hire prepared yet'}
                    </h2>
                    <Progress
                      prepared={draft.offerPrepared}
                      saved={draft.saved}
                      reviewed={draft.reviewed}
                      signed={Boolean(draft.document?.signature)}
                      completed={draft.employerReviewed}
                    />
                    {!draft.offerPrepared && (
                      <button
                        className='ob-button primary'
                        onClick={() => {
                          navigate('hire');
                        }}
                      >
                        Go to hire details
                      </button>
                    )}
                    {draft.correction && (
                      <p className='ob-notice'>
                        Outstanding correction: {draft.correction}
                      </p>
                    )}
                    {preview && draft.offerPrepared && onPreviewEmployee && (
                      <button
                        className='ob-button secondary'
                        onClick={onPreviewEmployee}
                      >
                        Open employee view
                      </button>
                    )}
                  </section>
                  {draft.offerPrepared && (
                    <>
                      <section className='ew-card'>
                        <h2>Employee details</h2>
                        <dl className='ew-summary'>
                          {[
                            ['Email', draft.profile.email],
                            ['Phone', draft.profile.phone],
                            [
                              'Emergency contact',
                              [
                                draft.profile.emergencyName,
                                draft.profile.emergencyRelationship,
                                draft.profile.emergencyPhone,
                              ]
                                .filter(Boolean)
                                .join(' · '),
                            ],
                            [
                              'Address',
                              [
                                draft.profile.address,
                                draft.profile.city,
                                draft.profile.postcode,
                                draft.profile.country,
                              ]
                                .filter(Boolean)
                                .join(', '),
                            ],
                          ].map(([label, value]) => (
                            <div key={label}>
                              <dt>{label}</dt>
                              <dd>{value || 'Not supplied yet'}</dd>
                            </div>
                          ))}
                        </dl>
                      </section>
                      <section className='ew-card'>
                        <h2>Document extraction</h2>
                        {draft.identity ? (
                          <IdentityDocumentReview
                            file={draft.identity}
                            analysis={draft.analysis}
                            processing={draft.analysis?.status === 'processing'}
                          />
                        ) : (
                          <p>No identity document uploaded yet.</p>
                        )}
                        {draft.analysis?.status === 'review' ? (
                          <>
                            {draft.analysis.scope !== 'extraction' && (
                              <pre className='fd-extracted-text'>
                                {draft.analysis.text}
                              </pre>
                            )}
                            <p className='ew-muted'>
                              Extraction does not verify identity or work
                              eligibility. HR must check the original.
                            </p>
                          </>
                        ) : (
                          <p className='ew-muted'>
                            {draft.analysis?.status === 'failed'
                              ? 'The extraction failed. The employee needs to retry or replace the file.'
                              : draft.analysis?.status === 'processing'
                                ? 'Extraction is still processing.'
                                : 'The employee needs to submit their document for extraction.'}
                          </p>
                        )}
                      </section>
                      {Object.keys(draft.supportingDocuments).length > 0 && (
                        <section className='ew-card'>
                          <h2>Supporting documents</h2>
                          <p className='ew-muted'>
                            Check the originals and extracted details.
                          </p>
                          {SUPPORTING_DOCUMENT_TYPES.map((type) => {
                            const item = draft.supportingDocuments[type.key];
                            if (!item) return null;
                            return (
                              <details
                                className='fd-supporting-review'
                                key={type.key}
                              >
                                <summary>
                                  {type.name} · {item.file.name}
                                </summary>
                                <IdentityDocumentReview
                                  file={item.file}
                                  analysis={item.analysis}
                                  processing={false}
                                  purpose='supporting'
                                />
                              </details>
                            );
                          })}
                        </section>
                      )}
                      <section className='ew-card'>
                        <h2>Salary confirmation</h2>
                        {draft.document?.signature ? (
                          <dl className='ew-summary'>
                            <div>
                              <dt>Signed by</dt>
                              <dd>{draft.document.signature.name}</dd>
                            </div>
                            <div>
                              <dt>Signed at</dt>
                              <dd>{draft.document.signature.signedAt}</dd>
                            </div>
                            <div>
                              <dt>Signed pay</dt>
                              <dd>{salaryLabel(draft.document.terms)}</dd>
                            </div>
                          </dl>
                        ) : (
                          <p className='ew-muted'>
                            The employee has not signed the current salary
                            confirmation.
                          </p>
                        )}
                      </section>
                      <section className='ew-card'>
                        <h2>Your review</h2>
                        <p className='ew-muted'>
                          Requesting a correction resets document review and the
                          salary signature.
                        </p>
                        <label className='fd-field' htmlFor='correction-reason'>
                          Correction needed
                          <textarea
                            id='correction-reason'
                            value={reason}
                            maxLength={2000}
                            rows={3}
                            onChange={(event) => setReason(event.target.value)}
                          />
                        </label>
                        <div className='ew-actions'>
                          <button
                            className='ob-button secondary'
                            onClick={requestCorrection}
                          >
                            Request correction
                          </button>
                        </div>
                        <hr />
                        {!ready && (
                          <div className='ob-notice'>
                            <p>
                              The employee must save their details, review their
                              document, sign their salary confirmation and
                              resolve corrections first. All assigned tasks and
                              policy acknowledgements must also be complete.
                            </p>
                            <ul>
                              {outstandingAssignments(
                                draft.tasks || [],
                                policies,
                                draft.policyAcknowledgements || [],
                              ).map((item) => (
                                <li key={item}>{item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {draft.employerReviewed ? (
                          <p className='ob-notice' role='status'>
                            Demo completion acknowledged. Real hires still need
                            HR approval and identity checks.
                          </p>
                        ) : (
                          <>
                            <label className='ew-check'>
                              <input
                                type='checkbox'
                                checked={reviewConsent}
                                disabled={!ready}
                                onChange={(event) =>
                                  setReviewConsent(event.target.checked)
                                }
                              />
                              <span>
                                I have reviewed these details for this local
                                walkthrough.
                              </span>
                            </label>
                            <button
                              className='ob-button primary'
                              disabled={!ready || !reviewConsent}
                              onClick={() => {
                                if (!ready || !reviewConsent) return;
                                setDraft((old) => ({
                                  ...old,
                                  employerReviewed: true,
                                }));
                                setNotice(
                                  'Local completion acknowledged. This is not a live HR approval.',
                                );
                              }}
                            >
                              Acknowledge local completion
                            </button>
                          </>
                        )}
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          ))}
        {page === 'settings' && (
          <>
            {page === 'settings' && (
              <section className='ew-card'>
                <div className='fd-section-heading'>
                  <div>
                    <h2>Service configuration</h2>
                    <p>
                      Configuration status only. Live service health is not
                      tested here.
                    </p>
                  </div>
                  <button
                    className='ob-button secondary'
                    disabled={configState === 'loading'}
                    onClick={() => setRefresh(refresh + 1)}
                  >
                    {configState === 'error'
                      ? 'Retry configuration'
                      : 'Refresh configuration'}
                  </button>
                </div>
                {configState === 'loading' && (
                  <p role='status'>Loading service configuration…</p>
                )}
                {configState === 'error' && (
                  <p className='ob-notice error' role='alert'>
                    Could not load configuration. Try again.
                  </p>
                )}
                {configState === 'ready' && services && (
                  <>
                    <dl className='ew-summary'>
                      <div>
                        <dt>Onboarding assistant</dt>
                        <dd>
                          <span className='fd-status-badge'>
                            {services.chat ? 'Configured' : 'Needs setup'}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Content Understanding</dt>
                        <dd>
                          <span className='fd-status-badge'>
                            {services.documents ? 'Configured' : 'Needs setup'}
                          </span>
                        </dd>
                      </div>
                      <div>
                        <dt>Live service verification</dt>
                        <dd>Not checked on this screen</dd>
                      </div>
                    </dl>
                    <p className='ew-muted'>
                      Test a chat reply and extract a sample document in
                      Employee to verify the services.
                    </p>
                  </>
                )}
              </section>
            )}
            {page === 'settings' && (
              <section className='ew-card'>
                <h2>Configuration links</h2>
                <p className='ew-muted'>
                  Open your company and Firstday in EAI to edit these settings.
                  Assign roles in Microsoft Entra.
                </p>
                <div className='fd-setup-list'>
                  {[
                    [
                      'Knowledge base',
                      'Manage the indexed handbook and company policies.',
                    ],
                    [
                      'Prompts & model',
                      'Manage the assistant prompt and model.',
                    ],
                    [
                      'Document types & rules',
                      'Manage document types and extraction rules.',
                    ],
                    [
                      'Roles & access',
                      'Assign Firstday.Admin to manage onboarding. Choosing a demo role grants no access.',
                    ],
                  ].map(([name, description]) => (
                    <div key={name}>
                      <div>
                        <h3>{name}</h3>
                        <p>{description}</p>
                      </div>
                      <a
                        className='ob-button secondary'
                        href={
                          name === 'Roles & access'
                            ? 'https://entra.microsoft.com/'
                            : ADMIN_PORTAL
                        }
                        target='_blank'
                        rel='noopener noreferrer'
                      >
                        {name === 'Roles & access'
                          ? 'Open Microsoft Entra'
                          : 'Open EAI portal'}
                        <span className='sr-only'> for {name} (new tab)</span>
                        <ArrowRight size={16} />
                      </a>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </>
        )}
      </>
    </WorkspaceShell>
  );
}

function Progress({
  prepared,
  saved,
  reviewed,
  signed,
  completed,
}: {
  prepared: boolean;
  saved: boolean;
  reviewed: boolean;
  signed: boolean;
  completed: boolean;
}): ReactNode {
  return (
    <ol className='fd-progress-list' aria-label='Employee onboarding progress'>
      {[
        ['Employer offer prepared', prepared],
        ['Personal details saved', saved],
        ['Extracted document reviewed', reviewed],
        ['Salary confirmation signed', signed],
        ['Employer local acknowledgement', completed],
      ].map(([label, done]) => (
        <li key={String(label)}>
          <span className={`fd-progress-mark ${done ? 'is-done' : ''}`}>
            {done ? <Check size={15} aria-hidden='true' /> : null}
          </span>
          <span>{label}</span>
          <small>{done ? 'Complete' : 'Pending'}</small>
        </li>
      ))}
    </ol>
  );
}
