'use client';

import { useEffect, useState, type ReactNode } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { signIn, useSession } from 'next-auth/react';
import { EmployeeWorkspace } from './employee-workspace';
import { RoleChooser } from './role-chooser';
import { RoleWorkspace } from './role-workspace';
import { SessionDraftProvider, useSessionDraft } from './session-draft';
import { ChatAssistant } from './chat-assistant';
import { FirstdayLogo } from './firstday-logo';
import {
  canOpenWorkspaceRole,
  type WorkspaceRole,
} from '@/lib/onboarding/roles';
import type { AiRuntime } from '@/lib/onboarding/ai';
import type { ContentRuntime } from '@/lib/onboarding/content-understanding';
interface AppRuntime extends AiRuntime {
  documents?: ContentRuntime;
}

function roleValue(value: string | null): WorkspaceRole | null {
  if (value === 'employer') return 'admin'; // Retired links; authorization still applies.
  return value === 'employee' || value === 'admin' ? value : null;
}

export function OnboardingApp(): ReactNode {
  return (
    <SessionDraftProvider>
      <OnboardingWorkspaces />
    </SessionDraftProvider>
  );
}

function OnboardingWorkspaces(): ReactNode {
  const { draft } = useSessionDraft();
  const { data: session, status } = useSession();
  const assignedRole = session?.user?.workspaceRole ?? 'employee';
  const local = process.env.NODE_ENV === 'development';
  const [previewRole, setPreviewRole] = useState<WorkspaceRole | null>(null);
  const [requestedRole, setRequestedRole] = useState<WorkspaceRole | null>(
    null,
  );
  const [connectionOpen, setConnectionOpen] = useState(false);
  const [runtime, setRuntime] = useState<AppRuntime | null>(null);
  const [helpTopic, setHelpTopic] = useState<'assistant' | 'documents'>(
    'assistant',
  );
  const [configError, setConfigError] = useState('');
  const [configAttempt, setConfigAttempt] = useState(0);
  const [demoEnabled, setDemoEnabled] = useState(false);

  useEffect(() => {
    const read = (): void => {
      const query = new URLSearchParams(window.location.search);
      setPreviewRole(local ? roleValue(query.get('previewRole')) : null);
      setRequestedRole(roleValue(query.get('role')));
    };
    read();
    window.addEventListener('popstate', read);
    return () => window.removeEventListener('popstate', read);
  }, [local]);

  useEffect(() => {
    const controller = new AbortController();
    setConfigError('');
    setRuntime(null);
    const base = (process.env.NEXT_PUBLIC_APP_BASE_PATH || '').replace(
      /\/$/,
      '',
    );
    fetch(`${base}/api/onboarding/config`, { signal: controller.signal })
      .then((response) => {
        if (!response.ok)
          throw new Error('Configuration could not be loaded. Try again.');
        return response.json();
      })
      .then((value: AppRuntime) => {
        if (!controller.signal.aborted) setRuntime(value);
      })
      .catch((error) => {
        if (!controller.signal.aborted) {
          setRuntime({
            configured: false,
            workflowId: '',
            tenantId: '',
            stages: {
              answer: 'answer',
              generate: 'generate',
              review: 'review',
            },
            reason:
              'Assistant settings could not be loaded. Open Assistant settings and try again.',
          });
          setConfigError(
            error instanceof Error
              ? error.message
              : 'Configuration could not be loaded. Try again.',
          );
        }
      });
    return () => controller.abort();
  }, [configAttempt, status]);

  function chooseRole(role: WorkspaceRole): void {
    const url = new URL(window.location.href);
    url.searchParams.delete(local ? 'role' : 'previewRole');
    url.searchParams.set(local ? 'previewRole' : 'role', role);
    window.history.pushState({}, '', url);
    setPreviewRole(local ? role : null);
    setRequestedRole(local ? null : role);
  }

  function chooseAgain(): void {
    const url = new URL(window.location.href);
    url.searchParams.delete('role');
    url.searchParams.delete('previewRole');
    window.history.pushState({}, '', url);
    setPreviewRole(null);
    setRequestedRole(null);
    setConnectionOpen(false);
  }

  const role = previewRole ?? requestedRole;
  const preview = previewRole !== null;
  const accountKey = session?.user?.id || status;
  useEffect(() => {
    const nextHeading = document.querySelector<HTMLElement>('main h1');
    nextHeading?.setAttribute('tabindex', '-1');
    nextHeading?.focus({ preventScroll: true });
  }, [role, status]);
  if (status === 'loading') {
    return (
      <main className='rw-signin ob-app fd-signin'>
        <p role='status'>Checking your sign-in…</p>
      </main>
    );
  }
  if (session?.error || (status !== 'authenticated' && !demoEnabled)) {
    return (
      <main className='rw-signin ob-app fd-signin'>
        <section className='rw-signin-card'>
          <p className='rw-chooser-brand'>
            <FirstdayLogo /> Firstday
          </p>
          <h1>{session?.error ? 'Sign in again' : 'Sign in to Firstday'}</h1>
          <p>
            {session?.error
              ? 'Your session could not be renewed. Sign in to continue.'
              : 'Sign in once to use onboarding, the assistant and document tools.'}
          </p>
          <button
            className='ob-button primary'
            onClick={() =>
              void signIn('microsoft-entra-id', {
                callbackUrl: window.location.href,
              })
            }
          >
            <svg width='18' height='18' viewBox='0 0 20 20' aria-hidden='true'>
              <path fill='#f25022' d='M0 0h9v9H0z' />
              <path fill='#7fba00' d='M11 0h9v9h-9z' />
              <path fill='#00a4ef' d='M0 11h9v9H0z' />
              <path fill='#ffb900' d='M11 11h9v9h-9z' />
            </svg>
            Continue with Microsoft
          </button>
          {session?.error && (
            <p className='ob-form-note'>
              Signing in reloads the page. Unsaved details and selected files
              will need to be added again.
            </p>
          )}
          {local && !session?.error && (
            <button
              className='rw-back-link'
              onClick={() => setDemoEnabled(true)}
            >
              Explore demo without signing in
            </button>
          )}
        </section>
      </main>
    );
  }
  let workspace: ReactNode;
  if (!role)
    workspace = <RoleChooser onSelect={chooseRole} localPreview={local} />;
  else if (!preview && status !== 'authenticated')
    workspace = (
      <main className='rw-signin ob-app fd-signin'>
        <section className='rw-signin-card'>
          <p className='ew-eyebrow'>FIRSTDAY</p>
          <h1>Sign in as {role}</h1>
          <p>Sign in to continue.</p>
          <button
            className='ob-button primary'
            onClick={() =>
              void signIn('microsoft-entra-id', {
                callbackUrl: window.location.href,
              })
            }
          >
            Continue with Microsoft
          </button>
          <button className='rw-back-link' onClick={chooseAgain}>
            Choose another role
          </button>
        </section>
      </main>
    );
  else if (!preview && !canOpenWorkspaceRole(role, assignedRole))
    workspace = (
      <main className='rw-signin ob-app fd-signin'>
        <section className='rw-signin-card'>
          <p className='ew-eyebrow'>FIRSTDAY</p>
          <h1>Access unavailable</h1>
          <p>
            Your account does not have the {role} role. Ask your EAI
            administrator to assign the appropriate Firstday role.
          </p>
          <button className='ob-button primary' onClick={chooseAgain}>
            Choose another role
          </button>
        </section>
      </main>
    );
  else
    workspace =
      role === 'employee' ? (
        <EmployeeWorkspace
          key={`employee-${accountKey}-${draft.caseId || 'draft'}`}
          preview={preview}
          configRevision={configAttempt}
          onChangeRole={chooseAgain}
          onConnection={() => {
            setHelpTopic('documents');
            setConnectionOpen(true);
          }}
          onPrepareHire={() => chooseRole('admin')}
        />
      ) : (
        <RoleWorkspace
          key={`${role}-${accountKey}`}
          role={role}
          preview={preview}
          onChangeRole={chooseAgain}
          onPreviewEmployee={() => chooseRole('employee')}
        />
      );
  return (
    <div className='ob-app fd-app'>
      {workspace}
      <ChatAssistant
        runtime={runtime}
        onConnection={() => {
          setHelpTopic('assistant');
          setConnectionOpen(true);
        }}
      />
      <Dialog.Root open={connectionOpen} onOpenChange={setConnectionOpen}>
        <Dialog.Portal>
          <Dialog.Overlay className='ob-modal-backdrop' />
          <Dialog.Content className='ob-modal fd-connection-dialog'>
            <div className='ob-modal-heading'>
              <Dialog.Title>
                {helpTopic === 'documents'
                  ? 'Document help'
                  : 'Assistant settings'}
              </Dialog.Title>
              <Dialog.Close className='ob-icon-button' aria-label='Close help'>
                <X size={20} />
              </Dialog.Close>
            </div>
            <Dialog.Description>
              {helpTopic === 'documents'
                ? 'Check the document service settings, or try loading them again.'
                : 'Check the assistant settings, or try loading them again.'}
            </Dialog.Description>
            {configError ? (
              <div className='fd-alert' role='alert'>
                <p>{configError}</p>
              </div>
            ) : !runtime ? (
              <p role='status'>Loading settings…</p>
            ) : (
              <div className='fd-alert'>
                <strong>
                  {helpTopic === 'documents'
                    ? runtime.documents?.configured
                      ? 'Document service configured'
                      : 'Document setup required'
                    : runtime.configured
                      ? 'Assistant configured'
                      : 'Assistant setup required'}
                </strong>
                <p>
                  {helpTopic === 'documents'
                    ? runtime.documents?.configured
                      ? 'Settings loaded. Read a document to test the service.'
                      : 'Ask your administrator to connect document reading in Admin.'
                    : runtime.configured
                      ? 'Settings loaded. Send a question to test the assistant.'
                      : 'Ask your administrator to connect the assistant in Admin.'}
                </p>
              </div>
            )}
            <button
              className='ob-button secondary'
              disabled={!runtime && !configError}
              onClick={() => setConfigAttempt((value) => value + 1)}
            >
              {configError ? 'Retry loading' : 'Reload settings'}
            </button>
            {status !== 'authenticated' && (
              <button
                className='ob-button primary'
                onClick={() =>
                  void signIn('microsoft-entra-id', {
                    callbackUrl: window.location.href,
                  })
                }
              >
                Sign in with EAI
              </button>
            )}
            {status !== 'authenticated' && (
              <p className='ob-form-note'>
                Signing in reloads the page. Download documents first; selected
                files will need to be added again.
              </p>
            )}
            {role === 'admin' && (
              <a
                className='ob-text-button'
                href='https://admin-portal.myenterprise.ai/'
                target='_blank'
                rel='noopener noreferrer'
              >
                Open EAI Admin Portal
              </a>
            )}
          </Dialog.Content>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  );
}
