'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { signIn, useSession } from 'next-auth/react';
import {
  ChevronDown,
  ChevronUp,
  FileText,
  LoaderCircle,
  Trash2,
} from 'lucide-react';
import {
  SUPPORTING_DOCUMENT_TYPES,
  type SupportingDocumentKey,
} from '@/lib/onboarding/document-catalog';
import {
  submitSupportingDocument,
  validateIdentityFile,
  type ContentRuntime,
} from '@/lib/onboarding/content-understanding';
import { useDraftField, useSessionDraft } from './session-draft';
import { IdentityDocumentReview } from './identity-document-review';

interface Props {
  runtime: ContentRuntime | null;
  onConnection: () => void;
}

export function SupportingDocuments({
  runtime,
  onConnection,
}: Props): ReactNode {
  const [documents, setDocuments] = useDraftField('supportingDocuments');
  const { setDraft } = useSessionDraft();
  const { status } = useSession();
  const [active, setActive] = useState<SupportingDocumentKey | null>(null);
  const [busy, setBusy] = useState<SupportingDocumentKey | null>(null);
  const [errors, setErrors] = useState<
    Partial<Record<SupportingDocumentKey, string>>
  >({});
  const pickers = useRef<
    Partial<Record<SupportingDocumentKey, HTMLInputElement | null>>
  >({});
  const request = useRef(0);
  const submissionLock = useRef(false);
  const invalidatePending = useCallback((): void => {
    request.current++;
    submissionLock.current = false;
  }, []);
  useEffect(() => invalidatePending, [invalidatePending]);
  const connected = runtime?.configured === true && runtime.mode === 'direct';
  const clearError = (key: SupportingDocumentKey): void =>
    setErrors((previous) => ({ ...previous, [key]: undefined }));
  const invalidateEmployerReview = (): void =>
    setDraft((previous) => ({ ...previous, employerReviewed: false }));

  const select = (key: SupportingDocumentKey, file?: File): void => {
    if (!file) return;
    setActive(key);
    try {
      validateIdentityFile(file);
      invalidatePending();
      setBusy(null);
      clearError(key);
      setDocuments((previous) => ({
        ...previous,
        [key]: { file, analysis: null, consent: false },
      }));
      invalidateEmployerReview();
    } catch (failure) {
      setErrors((previous) => ({
        ...previous,
        [key]:
          failure instanceof Error
            ? failure.message
            : 'Choose a PDF, JPG or PNG file up to 10 MB.',
      }));
    }
  };
  const remove = (key: SupportingDocumentKey): void => {
    invalidatePending();
    setBusy(null);
    clearError(key);
    setDocuments((previous) => {
      const next = { ...previous };
      delete next[key];
      return next;
    });
    invalidateEmployerReview();
    if (active === key) setActive(null);
    if (pickers.current[key]) pickers.current[key]!.value = '';
  };
  const extract = async (key: SupportingDocumentKey): Promise<void> => {
    if (submissionLock.current) return;
    const record = documents[key];
    clearError(key);
    if (!record?.file) {
      setErrors((previous) => ({
        ...previous,
        [key]: 'Upload a document before extracting its details.',
      }));
      return;
    }
    if (!record.consent) {
      setErrors((previous) => ({
        ...previous,
        [key]: 'Agree to send this file to Enterprise AI before extracting it.',
      }));
      return;
    }
    if (status !== 'authenticated') {
      setErrors((previous) => ({
        ...previous,
        [key]: 'Sign in with EAI before extracting this document.',
      }));
      return;
    }
    if (!connected || !runtime) {
      setErrors((previous) => ({
        ...previous,
        [key]:
          'Supporting document extraction needs setup. Check the connection and try again.',
      }));
      return;
    }
    submissionLock.current = true;
    const epoch = ++request.current;
    setBusy(key);
    setActive(key);
    setDocuments((previous) => ({
      ...previous,
      [key]: { ...record, analysis: null },
    }));
    invalidateEmployerReview();
    try {
      const result = await submitSupportingDocument(record.file, runtime, key);
      if (epoch !== request.current) return;
      if (result.status === 'processing')
        throw new Error(
          'Extraction did not return a final result. Try again, or ask your administrator to check the document service.',
        );
      if (result.status === 'review' && !result.fields?.length)
        throw new Error(
          'No extracted fields were returned. Ask your administrator to check the active document rules, or choose a clearer file.',
        );
      setDocuments((previous) =>
        previous[key]?.file === record.file
          ? { ...previous, [key]: { ...previous[key]!, analysis: result } }
          : previous,
      );
      if (result.status === 'failed')
        setErrors((previous) => ({
          ...previous,
          [key]:
            result.message ||
            'Extraction failed. Try again or replace the document.',
        }));
    } catch (failure) {
      if (epoch === request.current)
        setErrors((previous) => ({
          ...previous,
          [key]:
            failure instanceof Error
              ? failure.message
              : 'Extraction failed. Try again or choose a clearer file.',
        }));
    } finally {
      if (epoch === request.current) {
        submissionLock.current = false;
        setBusy(null);
      }
    }
  };

  return (
    <section
      className='ew-card fd-supporting-documents'
      aria-labelledby='supporting-documents-title'
    >
      <h2 id='supporting-documents-title'>Supporting documents</h2>
      <p className='ew-muted'>
        Add the documents your employer requests. Not every type applies to
        every hire. PDF, JPG or PNG · up to 10 MB each.
      </p>
      {Object.keys(documents).length > 0 && (
        <p className='ew-muted'>
          Remove clears a file from this session. It does not delete copies
          already sent to Enterprise AI.
        </p>
      )}
      <ul className='fd-supporting-list'>
        {SUPPORTING_DOCUMENT_TYPES.map(({ key, name, hint }) => {
          const record = documents[key];
          const open = active === key && Boolean(record);
          const extracted =
            record?.analysis?.status === 'review' &&
            Boolean(record.analysis.fields?.length);
          const itemError =
            errors[key] ||
            (record?.analysis?.status === 'failed'
              ? record.analysis.message
              : undefined);
          const state =
            busy === key
              ? 'Reading document…'
              : itemError
                ? 'Needs attention'
                : extracted
                  ? 'Details ready'
                  : record?.analysis?.status === 'failed'
                    ? 'Extraction failed'
                    : record
                      ? 'Ready to read'
                      : 'Not added';
          return (
            <li key={key} className='fd-supporting-row'>
              <div className='fd-supporting-summary'>
                <FileText size={19} aria-hidden='true' />
                <div className='fd-supporting-description'>
                  <h3>{name}</h3>
                  <p>{record ? record.file.name : hint}</p>
                  <span
                    className='fd-status-badge'
                    role={busy === key ? 'status' : undefined}
                  >
                    {state}
                  </span>
                </div>
                <div className='fd-supporting-actions'>
                  <input
                    ref={(element) => {
                      pickers.current[key] = element;
                    }}
                    hidden
                    type='file'
                    aria-label={`${name} file`}
                    accept='.pdf,.jpg,.jpeg,.png'
                    disabled={busy !== null}
                    onChange={(event) => {
                      select(key, event.target.files?.[0]);
                      event.currentTarget.value = '';
                    }}
                  />
                  <button
                    className='ob-button secondary'
                    aria-label={`${record ? 'Replace' : 'Upload'} ${name}`}
                    disabled={busy !== null}
                    onClick={() => pickers.current[key]?.click()}
                  >
                    {record ? 'Replace' : 'Upload'}
                  </button>
                  {record && (
                    <>
                      <button
                        className='ob-button secondary'
                        aria-label={`${open ? 'Hide' : 'View'} ${name}`}
                        aria-expanded={open}
                        aria-controls={`supporting-${key}`}
                        onClick={() => setActive(open ? null : key)}
                      >
                        {open ? 'Hide' : 'View'}
                        {open ? (
                          <ChevronUp size={14} aria-hidden='true' />
                        ) : (
                          <ChevronDown size={14} aria-hidden='true' />
                        )}
                      </button>
                      <button
                        className='fd-icon-button'
                        title='Remove from session'
                        aria-label={`Remove ${name}`}
                        disabled={busy !== null}
                        onClick={() => remove(key)}
                      >
                        <Trash2 size={17} aria-hidden='true' />
                      </button>
                    </>
                  )}
                </div>
              </div>
              {itemError && (
                <p className='fd-alert error' role='alert'>
                  {itemError}
                  {record ? ' Your selected file stays in this tab.' : ''}
                </p>
              )}
              {open && record && (
                <div className='fd-supporting-details' id={`supporting-${key}`}>
                  <IdentityDocumentReview
                    file={record.file}
                    analysis={record.analysis}
                    processing={busy === key}
                    purpose='supporting'
                  />
                  {!connected && (
                    <div className='fd-alert'>
                      <span>
                        {runtime === null
                          ? 'Getting document reading ready…'
                          : 'Document reading is not set up.'}
                      </span>
                      <button className='ob-text-button' onClick={onConnection}>
                        Get help
                      </button>
                    </div>
                  )}
                  {status !== 'authenticated' && (
                    <div className='fd-alert'>
                      <span>
                        Sign in to read your document. Signing in reloads the
                        page; selected files will need to be added again.
                      </span>
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
                  <label className='ew-checkbox'>
                    <input
                      type='checkbox'
                      checked={record.consent}
                      disabled={busy !== null}
                      onChange={(event) => {
                        const consent = event.target.checked;
                        setDocuments((previous) =>
                          previous[key]
                            ? {
                                ...previous,
                                [key]: { ...previous[key]!, consent },
                              }
                            : previous,
                        );
                      }}
                    />
                    <span>
                      I agree to send {name.toLowerCase()} to Enterprise AI for
                      processing and storage.
                    </span>
                  </label>
                  <button
                    className='ob-button primary'
                    disabled={
                      busy !== null ||
                      !record.consent ||
                      status !== 'authenticated' ||
                      !connected
                    }
                    onClick={() => void extract(key)}
                  >
                    {busy === key ? (
                      <>
                        <LoaderCircle
                          className='fd-spin'
                          size={16}
                          aria-hidden='true'
                        />
                        Reading document…
                      </>
                    ) : itemError ? (
                      'Try again'
                    ) : (
                      'Read document'
                    )}
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
