'use client';

import {
  createContext,
  useContext,
  useState,
  useEffect,
  useRef,
  useCallback,
  type Dispatch,
  type SetStateAction,
  type ReactNode,
} from 'react';
import { useSession } from 'next-auth/react';
import {
  EMPTY_PROFILE,
  EMPTY_TERMS,
  type EmployeeProfile,
  type EmploymentTerms,
  type SalaryDocument,
} from '@/lib/onboarding/employee-workflow';
import type { DocumentAnalysis } from '@/lib/onboarding/content-understanding';
import type { SupportingDocumentKey } from '@/lib/onboarding/document-catalog';
import type { DocumentKind, CheckResult } from '@/lib/onboarding/core';
import {
  caseId,
  initialTasks,
  loadDemoVault,
  saveDemoVault,
  type OnboardingTask,
  type CompanyPolicy,
  type PolicyAcknowledgement,
  type OnboardingActivity,
} from '@/lib/onboarding/cases';

export interface ResourceDraft {
  page: string;
  kind: DocumentKind;
  equipment: string;
  login: string;
  file: File | null;
  result: CheckResult | null;
  method: string;
}

export interface SupportingDocumentDraft {
  file: File;
  analysis: DocumentAnalysis | null;
  consent: boolean;
}

export interface SessionDraft {
  caseId?: string;
  tasks?: OnboardingTask[];
  policyAcknowledgements?: PolicyAcknowledgement[];
  activity?: OnboardingActivity[];
  invitedAt?: string;
  firstDayNotes?: string;
  resources: ResourceDraft;
  supportingDocuments: Partial<
    Record<SupportingDocumentKey, SupportingDocumentDraft>
  >;
  profile: EmployeeProfile;
  terms: EmploymentTerms;
  offerPrepared: boolean;
  saved: boolean;
  identity: File | null;
  photo: File | null;
  documentTypeKey: string;
  analysis: DocumentAnalysis | null;
  reviewed: boolean;
  document: SalaryDocument | null;
  example: boolean;
  employerReviewed: boolean;
  correction: string;
}

export function emptySessionDraft(): SessionDraft {
  return {
    supportingDocuments: {},
    resources: {
      page: 'templates',
      kind: 'checklist',
      equipment: '',
      login: '',
      file: null,
      result: null,
      method: '',
    },
    profile: { ...EMPTY_PROFILE },
    terms: { ...EMPTY_TERMS },
    offerPrepared: false,
    saved: false,
    identity: null,
    photo: null,
    documentTypeKey: 'drivers-licence',
    analysis: null,
    reviewed: false,
    document: null,
    example: false,
    employerReviewed: false,
    correction: '',
  };
}

export interface SavedCase {
  id: string;
  draft: SessionDraft;
  updatedAt: string;
}
interface Store {
  records: SavedCase[];
  policies: CompanyPolicy[];
  saveStatus: string;
  recordNotice: string;
  createCase: (profile: EmployeeProfile, terms: EmploymentTerms) => void;
  selectCase: (id: string) => void;
  addPolicy: (policy: CompanyPolicy) => void;
  draft: SessionDraft;
  setDraft: Dispatch<SetStateAction<SessionDraft>>;
}
function validSavedCase(record: SavedCase): boolean {
  const d = record?.draft;
  if (
    !record?.id ||
    !d ||
    d.caseId !== record.id ||
    !d.profile ||
    !d.terms ||
    !d.supportingDocuments ||
    !d.resources
  )
    return false;
  if (
    !Object.keys(EMPTY_PROFILE).every(
      (key) => typeof d.profile[key as keyof EmployeeProfile] === 'string',
    ) ||
    !Object.keys(EMPTY_TERMS).every(
      (key) => typeof d.terms[key as keyof EmploymentTerms] === 'string',
    )
  )
    return false;
  if (d.identity && !(d.identity instanceof Blob)) return false;
  if (d.photo && !(d.photo instanceof Blob)) return false;
  if (
    d.tasks &&
    (!Array.isArray(d.tasks) ||
      !d.tasks.every(
        (task) =>
          task &&
          typeof task.id === 'string' &&
          typeof task.title === 'string' &&
          ['employee', 'employer', 'admin'].includes(task.owner) &&
          typeof task.dueDate === 'string',
      ))
  )
    return false;
  if (
    d.policyAcknowledgements &&
    (!Array.isArray(d.policyAcknowledgements) ||
      !d.policyAcknowledgements.every(
        (item) =>
          item &&
          typeof item.policyId === 'string' &&
          typeof item.version === 'string' &&
          typeof item.acknowledgedAt === 'string',
      ))
  )
    return false;
  if (
    d.activity &&
    (!Array.isArray(d.activity) ||
      !d.activity.every(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.action === 'string' &&
          typeof item.actor === 'string' &&
          typeof item.at === 'string',
      ))
  )
    return false;
  return true;
}
const DraftContext = createContext<Store | null>(null);

function updateCaseLink(id: string): void {
  const url = new URL(window.location.href);
  url.searchParams.set('case', id);
  window.history.replaceState(window.history.state, '', url.href);
}

export function SessionDraftProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  const [draft, rawSetDraft] = useState(emptySessionDraft);
  const [records, setRecords] = useState<SavedCase[]>([]);
  const [policies, setPolicies] = useState<CompanyPolicy[]>([]);
  const [saveStatus, setSaveStatus] = useState('');
  const [recordNotice, setRecordNotice] = useState('');
  const [hydrated, setHydrated] = useState(false);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loadedAccount = useRef<string | null>(null);
  const revision = useRef(0);
  const writeQueue = useRef<Promise<unknown>>(Promise.resolve());
  const persisted = useRef<{
    records: SavedCase[];
    policies: CompanyPolicy[];
  } | null>(null);
  const { data: session, status } = useSession();
  const userId = session?.user?.id;
  const account = userId || 'unsigned-demo';
  const previousUser = useRef(userId);
  const localPersistence =
    process.env.NODE_ENV === 'development' && typeof indexedDB !== 'undefined';
  const actor = session?.user?.name || 'Demo user';
  const setDraft: Dispatch<SetStateAction<SessionDraft>> = useCallback(
    (value) => {
      rawSetDraft((old) => {
        const next = typeof value === 'function' ? value(old) : value;
        if (!next.caseId) return next;
        const actions: string[] = [];
        if (!old.saved && next.saved)
          actions.push('Personal details confirmed');
        if (old.identity !== next.identity && next.identity)
          actions.push('Identity document uploaded');
        if (!old.reviewed && next.reviewed)
          actions.push('Extracted details reviewed');
        if (!old.document?.signature && next.document?.signature)
          actions.push('Salary confirmation signed');
        if (!old.employerReviewed && next.employerReviewed)
          actions.push('Employer recorded completion review');
        if (old.correction !== next.correction && next.correction)
          actions.push('Correction requested');
        if (old.invitedAt !== next.invitedAt && next.invitedAt)
          actions.push('Local invitation link prepared');
        if (old.tasks !== next.tasks && old.caseId === next.caseId)
          actions.push('Assigned tasks updated');
        if (
          old.policyAcknowledgements !== next.policyAcknowledgements &&
          old.caseId === next.caseId
        )
          actions.push('Policy acknowledgement recorded');
        if (!actions.length) return next;
        return {
          ...next,
          activity: [
            ...(next.activity || []),
            ...actions.map((action) => ({
              id: caseId(),
              at: new Date().toISOString(),
              actor,
              action,
            })),
          ].slice(-100),
        };
      });
    },
    [actor],
  );
  useEffect(() => {
    if (status === 'loading') return;
    if (loadedAccount.current === account) return;
    let cancelled = false;
    if (previousUser.current !== userId) {
      rawSetDraft(emptySessionDraft());
      setRecords([]);
      setPolicies([]);
    }
    previousUser.current = userId;
    setRecordNotice('');
    loadedAccount.current = null;
    persisted.current = null;
    setHydrated(false);
    if (!localPersistence) {
      setHydrated(true);
      return;
    }
    setSaveStatus('Loading saved local records…');
    loadDemoVault(account)
      .then((stored) => {
        if (cancelled) return;
        const requested = new URLSearchParams(window.location.search).get(
          'case',
        );
        if (
          stored &&
          typeof stored === 'object' &&
          'records' in stored &&
          'policies' in stored &&
          Array.isArray(stored.records) &&
          Array.isArray(stored.policies)
        ) {
          const data = stored as {
            records: SavedCase[];
            policies: CompanyPolicy[];
            activeCaseId?: string;
            revision?: number;
          };
          const valid = data.records.every(validSavedCase);
          if (
            !valid ||
            new Set(data.records.map((record) => record.id)).size !==
              data.records.length ||
            (data.revision !== undefined &&
              (!Number.isSafeInteger(data.revision) || data.revision < 0))
          )
            throw new Error(
              'Saved local records are not readable. Keep this tab open.',
            );
          if (
            !data.policies.every(
              (policy) =>
                typeof policy.title === 'string' &&
                typeof policy.version === 'string' &&
                policy.file instanceof Blob,
            )
          )
            throw new Error('Saved policies are not readable.');
          const needsMigration = data.records.some((record) =>
            record.draft.tasks?.some(
              (task) => (task.owner as string) === 'employer',
            ),
          );
          const records = needsMigration
            ? data.records.map((record) =>
                record.draft.tasks?.some(
                  (task) => (task.owner as string) === 'employer',
                )
                  ? {
                      ...record,
                      draft: {
                        ...record.draft,
                        tasks: record.draft.tasks.map((task) =>
                          (task.owner as string) === 'employer'
                            ? { ...task, owner: 'admin' as const }
                            : task,
                        ),
                      },
                    }
                  : record,
              )
            : data.records;
          setRecords(records);
          persisted.current = {
            records: data.records,
            policies: data.policies,
          };
          revision.current = data.revision || 0;
          setPolicies(data.policies);
          const active = records.find(
            (record) => record.id === (requested || data.activeCaseId),
          );
          if (active) rawSetDraft(active.draft);
          else if (requested)
            setRecordNotice(
              'This demo invitation belongs to another browser or account. Live invitations are not connected.',
            );
          setSaveStatus('Saved in this browser only');
        } else if (stored !== undefined)
          throw new Error('Saved records are not readable.');
        else {
          revision.current = 0;
          setSaveStatus('Local demo records save in this browser only');
          if (requested)
            setRecordNotice(
              'This demo invitation belongs to another browser or account. Live invitations are not connected.',
            );
        }
        loadedAccount.current = account;
        setHydrated(true);
      })
      .catch(() => {
        if (!cancelled) {
          setSaveStatus(
            'Local records could not be loaded. Changes stay in this tab.',
          );
          setHydrated(false);
        }
      });
    return () => {
      cancelled = true;
    };
  }, [account, userId, status, localPersistence, loadAttempt]);
  useEffect(() => {
    if (!draft.caseId) return;
    setRecords((old) => {
      const selected = old.find((record) => record.id === draft.caseId);
      if (!selected || selected.draft === draft) return old;
      return old.map((record) =>
        record.id === draft.caseId && record.draft !== draft
          ? { ...record, draft, updatedAt: new Date().toISOString() }
          : record,
      );
    });
  }, [draft]);
  useEffect(() => {
    if (
      !hydrated ||
      !localPersistence ||
      loadedAccount.current !== account ||
      (!records.length && !policies.length) ||
      (persisted.current?.records === records &&
        persisted.current.policies === policies)
    )
      return;
    let cancelled = false;
    setSaveStatus('Saving in this browser…');
    const timer = setTimeout(() => {
      writeQueue.current = writeQueue.current
        .catch(() => undefined)
        .then(async () => {
          if (cancelled || loadedAccount.current !== account) return;
          const nextRevision = await saveDemoVault(
            account,
            { records, policies, activeCaseId: draft.caseId },
            revision.current,
          );
          if (loadedAccount.current === account) {
            revision.current = nextRevision;
            persisted.current = { records, policies };
          }
        })
        .then(() => {
          if (!cancelled) setSaveStatus('Saved in this browser only');
        })
        .catch((error: unknown) => {
          if (!cancelled)
            setSaveStatus(
              error instanceof Error
                ? error.message
                : 'Changes could not be saved. Keep this tab open.',
            );
        });
    }, 200);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [records, policies, hydrated, localPersistence, account, draft.caseId]);
  const createCase = (
    profile: EmployeeProfile,
    terms: EmploymentTerms,
  ): void => {
    const id = caseId();
    const next: SessionDraft = {
      ...emptySessionDraft(),
      caseId: id,
      profile,
      terms,
      offerPrepared: true,
      tasks: initialTasks(profile.startDate),
      policyAcknowledgements: [],
      activity: [
        {
          id: caseId(),
          at: new Date().toISOString(),
          actor,
          action: 'Employee record created with prefilled hire details',
        },
      ],
    };
    setRecords((old) => [
      ...old,
      { id, draft: next, updatedAt: new Date().toISOString() },
    ]);
    rawSetDraft(next);
    setRecordNotice('');
    updateCaseLink(id);
  };
  const selectCase = (id: string): void => {
    const record = records.find((item) => item.id === id);
    if (record) {
      rawSetDraft(record.draft);
      setRecordNotice('');
      updateCaseLink(id);
    }
  };
  const addPolicy = (policy: CompanyPolicy): void => {
    setPolicies((old) => {
      const existing = old.find(
        (item) => item.title.toLowerCase() === policy.title.toLowerCase(),
      );
      return [
        ...old.filter((item) => item.id !== existing?.id),
        { ...policy, id: existing?.id || policy.id },
      ];
    });
    setRecords((old) =>
      old.map((record) => ({
        ...record,
        draft: { ...record.draft, employerReviewed: false },
      })),
    );
    setDraft((old) => ({ ...old, employerReviewed: false }));
  };
  useEffect(() => {
    if (draft.caseId && saveStatus === 'Saved in this browser only') return;
    if (
      !draft.profile.legalName &&
      !draft.identity &&
      !Object.keys(draft.supportingDocuments).length
    )
      return;
    const warn = (event: BeforeUnloadEvent): void => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [
    draft.caseId,
    saveStatus,
    draft.profile.legalName,
    draft.identity,
    draft.supportingDocuments,
  ]);
  return (
    <DraftContext.Provider
      value={{
        draft,
        setDraft,
        records,
        policies,
        saveStatus,
        recordNotice,
        createCase,
        selectCase,
        addPolicy,
      }}
    >
      {localPersistence && (!hydrated || previousUser.current !== userId) ? (
        <main className='rw-signin ob-app fd-signin'>
          {saveStatus.includes('could not be loaded') ? (
            <section className='rw-signin-card'>
              <h1>Saved onboarding could not be loaded</h1>
              <p role='alert'>
                Your saved records have not been overwritten. Try loading them
                again.
              </p>
              <button
                className='ob-button primary'
                onClick={() => setLoadAttempt((value) => value + 1)}
              >
                Retry loading records
              </button>
            </section>
          ) : (
            <p role='status'>Loading your saved onboarding…</p>
          )}
        </main>
      ) : (
        children
      )}
    </DraftContext.Provider>
  );
}

export function useSessionDraft(): Store {
  const store = useContext(DraftContext);
  if (!store) throw new Error('Firstday session provider is missing.');
  return store;
}

export function useDraftField<K extends keyof SessionDraft>(
  key: K,
): [SessionDraft[K], Dispatch<SetStateAction<SessionDraft[K]>>] {
  const { draft, setDraft } = useSessionDraft();
  const setValue: Dispatch<SetStateAction<SessionDraft[K]>> = (value) => {
    setDraft((previous) => ({
      ...previous,
      [key]:
        typeof value === 'function'
          ? (value as (before: SessionDraft[K]) => SessionDraft[K])(
              previous[key],
            )
          : value,
    }));
  };
  return [draft[key], setValue];
}

export function useResourceField<K extends keyof ResourceDraft>(
  key: K,
): [ResourceDraft[K], Dispatch<SetStateAction<ResourceDraft[K]>>] {
  const { draft, setDraft } = useSessionDraft();
  const setValue: Dispatch<SetStateAction<ResourceDraft[K]>> = (value) => {
    setDraft((previous) => ({
      ...previous,
      resources: {
        ...previous.resources,
        [key]:
          typeof value === 'function'
            ? (value as (before: ResourceDraft[K]) => ResourceDraft[K])(
                previous.resources[key],
              )
            : value,
      },
    }));
  };
  return [draft.resources[key], setValue];
}
