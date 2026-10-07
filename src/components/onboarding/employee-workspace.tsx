'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession, signIn } from 'next-auth/react';
import {
  ArrowRight,
  Check,
  FileText,
  Home,
  UserRound,
  FolderOpen,
  Upload,
  Download,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import { SupportingDocuments } from './supporting-documents';
import { IdentityDocumentReview } from './identity-document-review';
import { WorkspaceShell } from './workspace-shell';
import { AssignedOnboarding } from './case-records';
import { outstandingAssignments } from '@/lib/onboarding/cases';
import { useDraftField, useSessionDraft } from './session-draft';
import {
  EXAMPLE_PROFILE,
  SIGNATURE_CONSENT,
  personalProfileIssues,
  profileIssues,
  termsIssues,
  salaryLabel,
  signSalaryDocument,
  type EmployeeProfile,
  type SalaryDocument,
} from '@/lib/onboarding/employee-workflow';
import {
  identityFindings,
  submitIdentityDocument,
  refreshIdentityDocument,
  validateIdentityFile,
  type ContentRuntime,
} from '@/lib/onboarding/content-understanding';
import {
  downloadPdf,
  generateSalaryConfirmation,
} from '@/lib/onboarding/files';

type Page = 'dashboard' | 'profile' | 'documents' | 'salary';
interface Props {
  onConnection: () => void;
  onChangeRole?: () => void;
  onPrepareHire?: () => void;
  preview?: boolean;
  configRevision?: number;
}
const dateLabel = (date: string): string =>
  date
    ? new Date(`${date}T12:00:00`).toLocaleDateString('en-AU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
      })
    : 'To be confirmed';

export function EmployeeWorkspace({
  onConnection,
  onChangeRole,
  onPrepareHire,
  preview = false,
  configRevision = 0,
}: Props): ReactNode {
  const { status: authStatus } = useSession();
  const { draft, setDraft, policies, saveStatus, recordNotice } =
    useSessionDraft();
  const outstanding = outstandingAssignments(
    draft.tasks || [],
    policies,
    draft.policyAcknowledgements || [],
  );
  const [profile, setProfile] = useDraftField('profile');
  const [saved, setSaved] = useDraftField('saved');
  const [identity, setIdentity] = useDraftField('identity');
  const [photo, setPhoto] = useDraftField('photo');
  const [documentTypeKey, setDocumentTypeKey] =
    useDraftField('documentTypeKey');
  const [analysis, setAnalysis] = useDraftField('analysis');
  const [reviewed, setReviewed] = useDraftField('reviewed');
  const [document, setDocument] = useDraftField('document');
  const terms = draft.terms;
  const kind = documentTypeKey === 'test2' ? 'Passport' : 'Driving licence';
  const [page, setPage] = useState<Page>('dashboard');
  const [uploadConsent, setUploadConsent] = useState(false);
  const [signature, setSignature] = useState('');
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [attempted, setAttempted] = useState(false);
  const [runtime, setRuntime] = useState<ContentRuntime | null>(null);
  const [configFailed, setConfigFailed] = useState(false);
  const [configAttempt, setConfigAttempt] = useState(0);
  const request = useRef(0);
  const heading = useRef<HTMLHeadingElement>(null);
  const errorSummary = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (error) errorSummary.current?.focus();
  }, [error]);
  useEffect(() => {
    const c = new AbortController();
    const sequence = request;
    setConfigFailed(false);
    setRuntime(null);
    fetch(
      `${process.env.NEXT_PUBLIC_APP_BASE_PATH || ''}/api/onboarding/config`,
      { signal: c.signal },
    )
      .then((r) =>
        r.ok
          ? r.json()
          : Promise.reject(new Error('Configuration unavailable')),
      )
      .then((r) => {
        if (!c.signal.aborted) setRuntime(r.documents || { configured: false });
      })
      .catch(() => {
        if (!c.signal.aborted) setConfigFailed(true);
      });
    return () => {
      c.abort();
      sequence.current++;
    };
  }, [configAttempt, configRevision, authStatus]);
  useEffect(() => {
    heading.current?.focus({ preventScroll: true });
    window.scrollTo?.({ top: 0 });
  }, [page]);
  const signed = !!document?.signature;
  const complete = [saved, reviewed, signed];
  const count = complete.filter(Boolean).length;
  const documentIssues =
    analysis?.text && analysis.scope !== 'extraction'
      ? identityFindings(
          analysis.text,
          profile.legalName,
          profile.birthDate,
          kind,
        )
      : [];
  const hasExtracted =
    analysis?.status === 'review' &&
    Boolean(analysis.fields?.length || analysis.text?.trim());
  const invalidate = (): void => {
    request.current++;
    setDocument(null);
    setSignature('');
    setConsent(false);
    setDraft((d) => ({ ...d, employerReviewed: false }));
  };
  const go = (target: Page): void => {
    setPage(target);
    setError('');
    setNotice('');
  };
  const changeProfile = (key: keyof EmployeeProfile, value: string): void => {
    setProfile((p) => ({ ...p, [key]: value }));
    setSaved(false);
    invalidate();
    if (key === 'legalName' || key === 'birthDate') {
      setReviewed(false);
      request.current++;
    }
  };
  const loadExample = (): void => {
    if (busy) return;
    setDraft((d) => ({
      ...d,
      profile: {
        ...EXAMPLE_PROFILE,
        legalName: d.profile.legalName || EXAMPLE_PROFILE.legalName,
        email: d.profile.email || EXAMPLE_PROFILE.email,
        department: d.profile.department,
        role: d.profile.role,
        manager: d.profile.manager,
        startDate: d.profile.startDate,
      },
      saved: false,
      reviewed: false,
      identity: null,
      photo: null,
      analysis: null,
      document: null,
      example: true,
      employerReviewed: false,
      correction: d.correction,
    }));
    request.current++;
    setSignature('');
    setConsent(false);
    setAttempted(false);
    setNotice(
      'Example personal details loaded. Your employer’s role and pay terms are retained. Use a synthetic document for this walkthrough.',
    );
    setError('');
  };
  const run = async (
    label: string,
    action: () => Promise<void>,
  ): Promise<void> => {
    if (busy) return;
    setBusy(label);
    setError('');
    setNotice('');
    try {
      await action();
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'This action failed. Try again.',
      );
    } finally {
      setBusy('');
    }
  };
  const checkFile = async (): Promise<void> =>
    run('document', async () => {
      if (!saved && runtime?.mode !== 'direct')
        throw new Error('Save your details before submitting for checking.');
      if (!identity || !runtime?.configured)
        throw new Error(
          'Choose a document. If reading it fails, use Get help.',
        );
      if (!uploadConsent)
        throw new Error(
          'Confirm permission to send this document to Enterprise AI.',
        );
      if (authStatus !== 'authenticated')
        throw new Error('Sign in with EAI to extract your document.');
      setAnalysis(null);
      setReviewed(false);
      invalidate();
      const epoch = ++request.current;
      const result = await submitIdentityDocument(
        identity,
        runtime,
        documentTypeKey,
      );
      if (epoch === request.current) {
        setAnalysis(result);
        if (result.status === 'failed') setError(result.message);
      }
    });
  const refresh = async (): Promise<void> =>
    run('refresh', async () => {
      if (!analysis || !runtime) return;
      const epoch = request.current;
      const result = await refreshIdentityDocument(analysis.jobId, runtime);
      if (epoch === request.current) {
        setAnalysis(result);
        if (result.status === 'failed') setError(result.message);
      }
    });
  const createDocument = async (): Promise<void> =>
    run('generate', async () => {
      if (!draft.offerPrepared)
        throw new Error('Your employer must prepare the pay terms first.');
      const issues = [...profileIssues(profile), ...termsIssues(terms)];
      if (issues.length) throw new Error(issues.join(' '));
      const doc: SalaryDocument = {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        profile: { ...profile },
        terms: { ...terms },
      };
      const epoch = ++request.current;
      await generateSalaryConfirmation(doc);
      if (epoch !== request.current) return;
      setDraft((current) =>
        current.profile === profile &&
        current.terms === terms &&
        current.offerPrepared &&
        current.saved
          ? { ...current, document: doc }
          : current,
      );
      setSignature('');
      setConsent(false);
      setNotice('Document created. Review the exact terms before signing.');
    });
  const download = async (): Promise<void> =>
    run('download', async () => {
      if (!document) return;
      const epoch = ++request.current;
      const bytes = await generateSalaryConfirmation(document);
      if (epoch !== request.current) return;
      downloadPdf(
        bytes,
        `salary-confirmation-${signed ? 'signed' : 'draft'}.pdf`,
      );
    });
  const sign = async (): Promise<void> =>
    run('sign', async () => {
      if (
        !document ||
        !saved ||
        !reviewed ||
        !draft.offerPrepared ||
        draft.correction
      )
        throw new Error(
          'Complete your details, document review and any corrections before signing.',
        );
      const result = signSalaryDocument(document, signature, consent);
      const epoch = ++request.current;
      await generateSalaryConfirmation(result);
      if (epoch !== request.current) return;
      setDraft((current) =>
        current.document === document &&
        current.saved &&
        current.reviewed &&
        current.offerPrepared &&
        !current.correction
          ? { ...current, document: result }
          : current,
      );
      setNotice(
        'Signed in this demo. Download your copy for your employer to review.',
      );
    });
  const fieldError = (
    key: keyof EmployeeProfile,
    required: boolean,
  ): string => {
    if (!attempted) return '';
    if (required && !profile[key].trim()) return 'This field is required.';
    if (
      key === 'email' &&
      profile.email &&
      !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(profile.email)
    )
      return 'Enter a valid email address.';
    if (
      (key === 'phone' || key === 'emergencyPhone') &&
      profile[key].replace(/\D/g, '').length < 7
    )
      return 'Enter a complete phone number.';
    if (
      key === 'birthDate' &&
      profile.birthDate &&
      profile.birthDate >= new Date().toISOString().slice(0, 10)
    )
      return 'Use a date in the past.';
    return '';
  };
  const input = (
    key: keyof EmployeeProfile,
    label: string,
    type = 'text',
    required = true,
    autocomplete = 'off',
  ): ReactNode => {
    const issue = fieldError(key, required);
    return (
      <label key={key} htmlFor={`fd-${key}`}>
        <span>
          {label}
          {required && <span aria-hidden='true'> *</span>}
        </span>
        <input
          id={`fd-${key}`}
          type={type}
          value={profile[key]}
          required={required}
          maxLength={key === 'address' ? 240 : 120}
          autoComplete={autocomplete}
          aria-invalid={Boolean(issue)}
          aria-describedby={issue ? `fd-${key}-error` : undefined}
          onChange={(e) => changeProfile(key, e.target.value)}
        />
        {issue && (
          <small className='fd-field-error' id={`fd-${key}-error`}>
            {issue}
          </small>
        )}
      </label>
    );
  };
  const detailsForm = (
    <form
      noValidate
      onSubmit={(e) => {
        e.preventDefault();
        setAttempted(true);
        const issues = personalProfileIssues(profile);
        if (issues.length) {
          setError('Check the highlighted fields below. ' + issues.join(' '));
          return;
        }
        setSaved(true);
        setError('');
        setNotice(
          draft.caseId
            ? 'Details confirmed. Check the save status on Home.'
            : 'Your details are saved for this session.',
        );
      }}
    >
      <fieldset disabled={!!busy}>
        <legend>Personal details</legend>
        <p>Use your legal name as it appears on your identity document.</p>
        <div className='ew-fields'>
          {input('legalName', 'Full legal name', 'text', true, 'name')}
          {input('preferredName', 'Preferred name', 'text', false, 'nickname')}
          {input('email', 'Personal email', 'email', true, 'email')}
          {input('phone', 'Mobile number', 'tel', true, 'tel')}
          {input('birthDate', 'Date of birth', 'date', true, 'bday')}
        </div>
      </fieldset>
      <fieldset disabled={!!busy}>
        <legend>Home address</legend>
        <div className='ew-fields'>
          {input('address', 'Street address', 'text', true, 'street-address')}
          {input('city', 'City / suburb', 'text', true, 'address-level2')}
          {input('postcode', 'Postcode', 'text', true, 'postal-code')}
          {input('country', 'Country', 'text', true, 'country-name')}
        </div>
      </fieldset>
      <fieldset disabled={!!busy}>
        <legend>Emergency contact</legend>
        <p>Someone we can contact in an emergency.</p>
        <div className='ew-fields'>
          {input('emergencyName', 'Contact name')}
          {input('emergencyRelationship', 'Relationship')}
          {input('emergencyPhone', 'Contact phone', 'tel')}
        </div>
      </fieldset>
      <div className='ew-actions'>
        <button className='ob-button primary' disabled={!!busy}>
          Save details <ArrowRight size={16} />
        </button>
        {preview && (
          <button
            type='button'
            className='ob-text-button'
            onClick={loadExample}
            disabled={!!busy}
          >
            Use example details
          </button>
        )}
      </div>
    </form>
  );
  const offerSummary = (
    <dl className='ew-summary'>
      <div>
        <dt>Job title</dt>
        <dd>{profile.role || 'To be confirmed'}</dd>
      </div>
      <div>
        <dt>Department</dt>
        <dd>{profile.department || 'To be confirmed'}</dd>
      </div>
      <div>
        <dt>Manager</dt>
        <dd>{profile.manager || 'To be confirmed'}</dd>
      </div>
      <div>
        <dt>Start date</dt>
        <dd>{dateLabel(profile.startDate)}</dd>
      </div>
    </dl>
  );
  const selectIdentity = (file?: File): void => {
    if (!file) return;
    try {
      validateIdentityFile(file);
      setIdentity(file);
      setAnalysis(null);
      setReviewed(false);
      setUploadConsent(false);
      invalidate();
      request.current++;
      setError('');
    } catch (e) {
      setError((e as Error).message);
    }
  };
  const identityUpload = (
    <>
      <div className='fd-upload-toolbar'>
        <label className='ew-field'>
          Document type
          <select
            aria-label='Document type'
            value={documentTypeKey}
            disabled={!!busy}
            onChange={(e) => {
              setDocumentTypeKey(e.target.value);
              setAnalysis(null);
              setReviewed(false);
              invalidate();
              request.current++;
            }}
          >
            <option value='drivers-licence'>Driving licence</option>
            <option value='test2'>Passport</option>
          </select>
        </label>
        <span className='fd-status-badge'>
          {reviewed ? 'Reviewed' : identity ? 'Ready to read' : 'Required'}
        </span>
      </div>
      <ul className='ew-upload-checklist' aria-label='Documents needed'>
        <li>
          <span
            className={`ew-file-status ${identity ? 'added' : ''}`}
            aria-label={
              identity
                ? 'Identity document added locally'
                : 'Identity document needed'
            }
          >
            {identity ? <Check size={14} /> : <FileText size={17} />}
          </span>
          <div className='ew-file-description'>
            <b>{kind}</b>
            <small>
              {identity
                ? `${identity.name} · ${(identity.size / 1024).toFixed(0)} KB`
                : 'Required · PDF, JPG or PNG · up to 10 MB'}
            </small>
          </div>
          <label className='ew-upload-button'>
            <Upload size={15} /> {identity ? 'Replace' : 'Upload'}
            <input
              aria-label='Identity document'
              type='file'
              accept='.pdf,.jpg,.jpeg,.png'
              disabled={!!busy}
              onChange={(e) => {
                selectIdentity(e.target.files?.[0]);
                e.target.value = '';
              }}
            />
          </label>
          {identity && (
            <button
              className='fd-icon-button'
              aria-label='Remove identity document'
              disabled={!!busy}
              onClick={() => {
                setIdentity(null);
                setAnalysis(null);
                setReviewed(false);
                invalidate();
                request.current++;
              }}
            >
              <Trash2 size={16} />
            </button>
          )}
        </li>
        <li>
          <span className={`ew-file-status ${photo ? 'added' : ''}`}>
            {photo && <Check size={14} />}
          </span>
          <div className='ew-file-description'>
            <b>Profile photo</b>
            <small>{photo ? photo.name : 'Optional · JPG or PNG'}</small>
          </div>
          <label className='ew-upload-button'>
            <Upload size={15} /> {photo ? 'Replace' : 'Upload'}
            <input
              aria-label='Profile photo'
              type='file'
              accept='.jpg,.jpeg,.png'
              disabled={!!busy}
              onChange={(e) => {
                const f = e.target.files?.[0];
                e.target.value = '';
                if (!f) return;
                try {
                  if (!['image/jpeg', 'image/png'].includes(f.type))
                    throw new Error('Choose a JPG or PNG profile photo.');
                  validateIdentityFile(f);
                  setPhoto(f);
                  setError('');
                } catch (e) {
                  setError((e as Error).message);
                }
              }}
            />
          </label>
          {photo && (
            <button
              className='fd-icon-button'
              aria-label='Remove profile photo'
              onClick={() => setPhoto(null)}
            >
              <Trash2 size={16} />
            </button>
          )}
        </li>
      </ul>
      <p className='ew-upload-hint'>
        Choose Read document to extract the details. Sending files to EAI
        requires your consent below.
      </p>
    </>
  );
  const documentStep = (
    <>
      <h2>Identity document</h2>
      <p className='ew-muted'>
        Choose one identity document. Review the document details before you
        confirm your review.
      </p>
      {identityUpload}
      {identity && (
        <>
          {!runtime?.configured ? (
            <div className='fd-alert'>
              {configFailed
                ? 'Document setup could not be loaded.'
                : runtime
                  ? 'Document reading needs setup.'
                  : 'Loading document service…'}{' '}
              {configFailed ? (
                <button
                  className='ob-text-button'
                  onClick={() => setConfigAttempt((value) => value + 1)}
                >
                  Retry document configuration
                </button>
              ) : (
                <button className='ob-text-button' onClick={onConnection}>
                  Get help
                </button>
              )}
            </div>
          ) : (
            <>
              <label className='ew-checkbox'>
                <input
                  type='checkbox'
                  checked={uploadConsent}
                  disabled={!!busy}
                  onChange={(e) => setUploadConsent(e.target.checked)}
                />
                <span>
                  I agree to send this document to Enterprise AI for processing
                  and storage.
                </span>
              </label>
              {authStatus !== 'authenticated' && (
                <div className='fd-alert'>
                  Sign in with EAI to extract this file. Local files clear when
                  sign-in reloads the page.
                  <button
                    className='ob-button secondary'
                    onClick={() =>
                      void signIn('microsoft-entra-id', {
                        callbackUrl: window.location.href,
                      })
                    }
                  >
                    Sign in with EAI
                  </button>
                </div>
              )}
              <div className='ew-actions'>
                <button
                  className='ob-button primary'
                  disabled={
                    !!busy ||
                    !uploadConsent ||
                    authStatus !== 'authenticated' ||
                    (!saved && runtime.mode !== 'direct')
                  }
                  onClick={() => void checkFile()}
                >
                  {busy === 'document' ? (
                    <>
                      <LoaderCircle className='fd-spin' size={16} /> Extracting
                      details…
                    </>
                  ) : runtime.mode === 'direct' ? (
                    'Read document'
                  ) : (
                    'Submit for checking'
                  )}
                </button>
                {!saved && runtime.mode !== 'direct' && (
                  <span>Save your details first.</span>
                )}
              </div>
            </>
          )}
          <IdentityDocumentReview
            file={identity}
            analysis={analysis}
            processing={
              busy === 'document' || analysis?.status === 'processing'
            }
          />
          {analysis?.status === 'processing' && (
            <button
              className='ob-button secondary'
              disabled={!!busy}
              onClick={() => void refresh()}
            >
              {busy === 'refresh' ? 'Checking…' : 'Check processing status'}
            </button>
          )}
          {analysis?.status === 'failed' && (
            <div className='fd-alert error' role='alert'>
              {analysis.message} Replace the file or try extraction again.
            </div>
          )}
          {analysis?.scope !== 'extraction' && analysis?.text && (
            <pre className='ew-analysis-text'>{analysis.text}</pre>
          )}
          {documentIssues.length > 0 && (
            <div className='fd-alert error' role='alert'>
              <b>Details need attention</b>
              <ul>
                {documentIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
          {hasExtracted && (
            <div className='fd-review-confirm'>
              <label className='ew-checkbox'>
                <input
                  type='checkbox'
                  checked={reviewed}
                  disabled={!!busy || documentIssues.length > 0}
                  onChange={(e) => {
                    setReviewed(e.target.checked);
                    invalidate();
                  }}
                />
                <span>
                  I compared the extracted fields with my original document.
                  They are correct and readable.
                </span>
              </label>
              <p className='ew-muted'>
                Your employer still needs to check your identity and work
                eligibility.
              </p>
            </div>
          )}
        </>
      )}
    </>
  );
  const salaryStep = (
    <>
      <h2>Review your salary confirmation</h2>
      <p className='ew-muted'>
        These terms come from your employer. Ask HR to correct anything that
        looks wrong before signing.
      </p>
      {!draft.offerPrepared ? (
        <div className='fd-empty-state'>
          <FileText size={30} />
          <h3>Waiting for your employment terms</h3>
          <p>
            Your employer needs to prepare your role, start date and pay terms.
          </p>
          {preview && onPrepareHire && (
            <button className='ob-button primary' onClick={onPrepareHire}>
              Open Admin to prepare terms <ArrowRight size={16} />
            </button>
          )}
        </div>
      ) : (
        <>
          {!document && (
            <div className='fd-offer-summary'>
              {offerSummary}
              <dl className='ew-summary'>
                <div>
                  <dt>Employer</dt>
                  <dd>{terms.company}</dd>
                </div>
                <div>
                  <dt>Gross pay</dt>
                  <dd>{salaryLabel(terms)}</dd>
                </div>
                <div>
                  <dt>Employment</dt>
                  <dd>
                    {terms.employmentType} · {terms.hours} hours/week
                  </dd>
                </div>
                <div>
                  <dt>Pay frequency</dt>
                  <dd>{terms.payFrequency}</dd>
                </div>
                <div>
                  <dt>Super / pension</dt>
                  <dd>{terms.retirement}</dd>
                </div>
              </dl>
            </div>
          )}
          {!saved && (
            <div className='fd-alert'>
              Save your personal details to create your confirmation.{' '}
              <button className='ob-text-button' onClick={() => go('profile')}>
                Go to details
              </button>
            </div>
          )}
          {!document ? (
            <button
              className='ob-button primary'
              disabled={!!busy || !saved}
              onClick={() => void createDocument()}
            >
              {busy === 'generate'
                ? 'Creating document…'
                : 'Create salary confirmation'}{' '}
              <FileText size={16} />
            </button>
          ) : (
            <>
              <article
                className='ew-paper'
                aria-label='Salary confirmation preview'
              >
                <div className='ew-paper-top'>
                  <span>{document.terms.company}</span>
                  <span className='fd-status-badge'>
                    {signed ? 'Signed' : 'Draft'}
                  </span>
                </div>
                <h3>Employment and salary confirmation</h3>
                <p>
                  Prepared for <b>{document.profile.legalName}</b>
                </p>
                {offerSummary}
                <p>
                  {document.terms.employmentType} · {document.terms.hours}{' '}
                  hours/week
                </p>
                <div className='ew-salary'>
                  <small>GROSS PAY</small>
                  <strong>{salaryLabel(document.terms)}</strong>
                  <p>
                    {document.terms.retirement} · Paid{' '}
                    {document.terms.payFrequency.toLowerCase()}
                  </p>
                </div>
                <p>
                  Amounts are before applicable deductions. This confirmation
                  records the supplied pay terms and accompanies your full
                  employment agreement.
                </p>
                {signed && (
                  <div className='ew-signed'>
                    <Check size={20} />
                    <div>
                      <b>Signed by {document.signature!.name}</b>
                      <p>
                        {new Date(document.signature!.signedAt).toLocaleString(
                          'en-AU',
                        )}{' '}
                        · Typed-name acknowledgement
                      </p>
                    </div>
                  </div>
                )}
              </article>
              <button
                className='ob-button secondary'
                onClick={() => void download()}
                disabled={!!busy}
              >
                <Download size={16} /> Download{' '}
                {signed ? 'signed copy' : 'draft PDF'}
              </button>
              {!signed && (
                <form
                  className='ew-signature'
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sign();
                  }}
                >
                  <fieldset
                    disabled={
                      !!busy || !saved || !reviewed || Boolean(draft.correction)
                    }
                  >
                    <legend>Sign your confirmation</legend>
                    <label>
                      Type your full legal name
                      <input
                        aria-label='Signature full legal name'
                        value={signature}
                        onChange={(e) => setSignature(e.target.value)}
                        autoComplete='name'
                        required
                        maxLength={120}
                      />
                    </label>
                    <label className='ew-checkbox'>
                      <input
                        type='checkbox'
                        checked={consent}
                        onChange={(e) => setConsent(e.target.checked)}
                        required
                      />
                      <span>{SIGNATURE_CONSENT}</span>
                    </label>
                    <button
                      className='ob-button primary'
                      disabled={!consent || !signature.trim()}
                    >
                      Sign salary confirmation
                    </button>
                  </fieldset>
                  {!reviewed && (
                    <p className='fd-alert'>
                      Review your document first.{' '}
                      <button
                        className='ob-text-button'
                        type='button'
                        onClick={() => go('documents')}
                      >
                        Go to document review
                      </button>
                    </p>
                  )}
                </form>
              )}
            </>
          )}
          {signed && (
            <div className='fd-alert success'>
              <b>
                {draft.employerReviewed
                  ? 'Demo onboarding complete'
                  : outstanding.length
                    ? 'Salary confirmation signed'
                    : 'Ready for employer review'}
              </b>
              <p>
                {draft.employerReviewed
                  ? 'Your employer recorded a review in this demo.'
                  : outstanding.length
                    ? 'Finish the outstanding first-day tasks and policy acknowledgements on Home before employer review.'
                    : 'Your required tasks are complete. Your employer still needs to review the onboarding record.'}
              </p>
              {preview && onPrepareHire && (
                <button className='ob-button secondary' onClick={onPrepareHire}>
                  Open onboarding review <ArrowRight size={16} />
                </button>
              )}
            </div>
          )}
        </>
      )}
    </>
  );
  const navigation = [
    { id: 'dashboard', label: 'Home', Icon: Home },
    { id: 'profile', label: 'My profile', Icon: UserRound },
    { id: 'documents', label: 'My documents', Icon: FolderOpen },
    { id: 'salary', label: 'Salary confirmation', Icon: FileText },
  ];
  return (
    <WorkspaceShell
      role='employee'
      page={page}
      title={
        page === 'dashboard'
          ? 'Home'
          : page === 'profile'
            ? 'My profile'
            : page === 'documents'
              ? 'My documents'
              : 'Salary confirmation'
      }
      navigation={navigation}
      onNavigate={(target) => go(target as Page)}
      onChangeRole={onChangeRole}
      preview={preview}
    >
      <>
        <div className='fd-page-heading ew-title'>
          <div>
            <h1 ref={heading} tabIndex={-1}>
              {page === 'dashboard'
                ? `Welcome${profile.preferredName ? `, ${profile.preferredName}` : ''}.`
                : page === 'profile'
                  ? 'My profile'
                  : page === 'documents'
                    ? 'My documents'
                    : 'Salary confirmation'}
            </h1>
            <p>
              {page === 'dashboard'
                ? 'Your details, documents and employment agreement in one place.'
                : page === 'profile'
                  ? 'Your personal details and employer-prepared role information.'
                  : page === 'documents'
                    ? 'Upload your identity document and any supporting documents your employer requests.'
                    : 'Review your employer’s pay terms and sign your confirmation when you’re ready.'}
            </p>
          </div>
        </div>
        {recordNotice && (
          <p role='alert' className='fd-alert warning'>
            {recordNotice}
          </p>
        )}
        {draft.example && (
          <div className='fd-alert'>
            Example employee record. Use synthetic documents for this
            walkthrough.
          </div>
        )}
        {draft.correction && (
          <div className='fd-alert warning' role='status'>
            <b>Your employer requested a correction</b>
            <p>{draft.correction}</p>
            <button
              className='ob-button secondary'
              disabled={!saved || !reviewed}
              onClick={() => {
                setDraft((d) => ({ ...d, correction: '' }));
                setNotice(
                  'Correction marked as addressed. Review and sign a new confirmation.',
                );
              }}
            >
              Mark correction addressed
            </button>
            <small>
              Update and save your details, then recheck your document before
              marking this addressed.
            </small>
          </div>
        )}
        {error && (
          <div
            ref={errorSummary}
            tabIndex={-1}
            className='fd-alert error'
            role='alert'
          >
            {error}
          </div>
        )}
        {notice && (
          <div className='fd-alert success' role='status'>
            {notice}
          </div>
        )}
        {page === 'dashboard' && (
          <>
            {draft.caseId && saveStatus && (
              <p role='status' className='ew-muted'>
                {saveStatus}
              </p>
            )}
            <div className='ew-columns'>
              <section className='ew-card'>
                <div className='fd-card-heading'>
                  <h2>Your onboarding details</h2>
                  <span className='fd-status-badge'>{count}/3 complete</span>
                </div>
                <ul className='ew-task-list'>
                  {[
                    'Add your personal details',
                    'Upload and review your document',
                    'Review and sign your pay terms',
                  ].map((label, i) => (
                    <li key={label}>
                      <span
                        className={`ew-task-dot ${complete[i] ? 'done' : ''}`}
                      >
                        {complete[i] ? (
                          <Check size={15} />
                        ) : (
                          <FileText size={15} />
                        )}
                      </span>
                      <div>
                        <b>{label}</b>
                        <small>
                          {complete[i]
                            ? 'Complete'
                            : i === 2 && !draft.offerPrepared
                              ? 'Waiting for employer pay terms'
                              : i === 2 && (!saved || !reviewed)
                                ? 'Review terms now; details and document review are required to sign'
                                : 'Ready to open'}
                        </small>
                      </div>
                      <button
                        aria-label={`Open ${label}`}
                        onClick={() => {
                          go((['profile', 'documents', 'salary'] as const)[i]);
                        }}
                      >
                        <ArrowRight size={18} />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
              <section className='ew-card'>
                <h2>Your employment</h2>
                {offerSummary}
                <button
                  className='ob-text-button'
                  onClick={() => go('profile')}
                >
                  View my profile <ArrowRight size={14} />
                </button>
              </section>
            </div>
            <AssignedOnboarding role='employee' />
            {draft.firstDayNotes && (
              <section className='ew-card'>
                <h2>Your first day</h2>
                <p className='fd-arrival-notes'>{draft.firstDayNotes}</p>
              </section>
            )}
          </>
        )}
        {page === 'profile' && (
          <div className='fd-form-layout'>
            <section className='ew-card'>
              <p className='ew-muted'>Fields marked * are required.</p>
              {detailsForm}
            </section>
            <aside className='ew-card'>
              <h2>Prepared by your employer</h2>
              {offerSummary}
              <p className='ew-muted'>
                Contact your manager or HR if these details need to change.
              </p>
              {preview && onPrepareHire && (
                <button className='ob-text-button' onClick={onPrepareHire}>
                  Open Admin view <ArrowRight size={15} />
                </button>
              )}
            </aside>
          </div>
        )}
        {page === 'documents' && (
          <>
            <section className='ew-card ew-step-documents'>
              {documentStep}
            </section>
            <SupportingDocuments
              runtime={runtime}
              onConnection={onConnection}
            />
            {document && (
              <section className='ew-card'>
                <h2>Employment paperwork</h2>
                <div className='fd-document-row'>
                  <FileText size={24} />
                  <div>
                    <b>Salary confirmation</b>
                    <small>
                      {signed ? 'Signed copy ready' : 'Draft created'}
                    </small>
                  </div>
                  <button
                    className='ob-button secondary'
                    disabled={!!busy}
                    onClick={() => void download()}
                  >
                    <Download size={16} /> Download PDF
                  </button>
                  <button
                    className='ob-text-button'
                    onClick={() => go('salary')}
                  >
                    View agreement
                  </button>
                </div>
              </section>
            )}
          </>
        )}
        {page === 'salary' && (
          <section className='ew-card'>{salaryStep}</section>
        )}
      </>
    </WorkspaceShell>
  );
}
