'use client';

import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { useSession, signIn } from 'next-auth/react';
import { ArrowUpRight, MessageCircle, Send, X } from 'lucide-react';
import { askKnowledgeBase, type AiRuntime } from '@/lib/onboarding/ai';
import type { Answer } from '@/lib/onboarding/core';

interface Message {
  id: number;
  role: 'user' | 'assistant';
  text: string;
  answer?: Answer;
}
interface Props {
  runtime: AiRuntime | null;
  onConnection?: () => void;
}
function safeSource(value?: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && !url.username && !url.password
      ? url.href
      : undefined;
  } catch {
    return undefined;
  }
}

/** The platform resolves the configured prompt, model and indexed company documents. */
export function ChatAssistant({ runtime, onConnection }: Props): ReactNode {
  const { data: session, status } = useSession();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [question, setQuestion] = useState('');
  const [busy, setBusy] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState('');
  const [failedQuestion, setFailedQuestion] = useState('');
  const request = useRef(0);
  const messageId = useRef(0);
  const launcher = useRef<HTMLButtonElement>(null);
  const closer = useRef<HTMLButtonElement>(null);
  const composer = useRef<HTMLTextAreaElement>(null);
  const log = useRef<HTMLDivElement>(null);
  const activeQuestion = useRef('');
  const invalidateRequests = useCallback((): void => {
    request.current++;
  }, []);
  const ready = status === 'authenticated' && runtime?.configured === true;

  useEffect(() => {
    invalidateRequests();
    setMessages([]);
    setQuestion('');
    setBusy(false);
    setPartial('');
    setError('');
    setFailedQuestion('');
    return invalidateRequests;
  }, [session?.user?.id, invalidateRequests]);
  useEffect(() => {
    if (!open) return;
    if (composer.current && !composer.current.disabled)
      composer.current.focus();
    else closer.current?.focus();
    const escape = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
        launcher.current?.focus();
      }
    };
    window.addEventListener('keydown', escape);
    return () => window.removeEventListener('keydown', escape);
  }, [open]);
  useEffect(() => {
    if (log.current) log.current.scrollTop = log.current.scrollHeight;
  }, [messages, partial, busy, error, open]);

  const send = async (text: string, retry = false): Promise<void> => {
    if (!text.trim() || busy || !ready || !runtime) return;
    const active = ++request.current;
    activeQuestion.current = text.trim();
    const history = retry ? messages.slice(0, -1) : messages;
    if (!retry)
      setMessages((previous) => [
        ...previous,
        { id: ++messageId.current, role: 'user', text: text.trim() },
      ]);
    setQuestion('');
    setBusy(true);
    setPartial('');
    setError('');
    setFailedQuestion('');
    try {
      const answer = await askKnowledgeBase(
        text.trim(),
        runtime,
        (value) => {
          if (active === request.current) setPartial(value);
        },
        history,
      );
      if (active !== request.current) return;
      setMessages((previous) => [
        ...previous,
        {
          id: ++messageId.current,
          role: 'assistant',
          text: answer.text,
          answer,
        },
      ]);
    } catch (failure) {
      if (active !== request.current) return;
      setError(
        failure instanceof Error
          ? failure.message
          : 'The assistant could not reply. Try again.',
      );
      setFailedQuestion(text.trim());
    } finally {
      if (active === request.current) {
        setBusy(false);
        setPartial('');
        composer.current?.focus();
      }
    }
  };
  const close = (): void => {
    setOpen(false);
    launcher.current?.focus();
  };
  const stop = (): void => {
    request.current++;
    setBusy(false);
    setPartial('');
    setFailedQuestion(activeQuestion.current);
    setError('Reply stopped. Retry the question when you are ready.');
    composer.current?.focus();
  };
  return (
    <>
      <button
        ref={launcher}
        className='fd-chat-launcher'
        aria-expanded={open}
        aria-controls='firstday-assistant'
        onClick={() => (open ? close() : setOpen(true))}
      >
        <MessageCircle size={20} aria-hidden='true' />
        <span>Ask Firstday</span>
      </button>
      {open && (
        <section
          className='fd-chat-panel'
          id='firstday-assistant'
          role='dialog'
          aria-labelledby='firstday-assistant-title'
        >
          <header className='fd-chat-header'>
            <div>
              <h2 id='firstday-assistant-title'>Onboarding assistant</h2>
              <p>Company policies and onboarding help</p>
            </div>
            <button
              ref={closer}
              className='fd-icon-button'
              aria-label='Close assistant'
              onClick={close}
            >
              <X size={20} />
            </button>
          </header>
          <div
            ref={log}
            className='fd-chat-log'
            role='log'
            aria-label='Assistant conversation'
            aria-live='polite'
            aria-relevant='additions'
          >
            {!messages.length && (
              <div className='fd-chat-intro'>
                <p>Ask about company policies, your first day or IT setup.</p>
                <div className='fd-chat-suggestions'>
                  {[
                    "What's our leave policy?",
                    'How do I set up my laptop?',
                  ].map((value) => (
                    <button
                      key={value}
                      disabled={!ready || busy}
                      onClick={() => {
                        setQuestion(value);
                        composer.current?.focus();
                      }}
                    >
                      {value}
                    </button>
                  ))}
                </div>
              </div>
            )}
            {messages.map((message) => (
              <div
                key={message.id}
                className={`fd-chat-message fd-chat-${message.role}`}
              >
                <span className='fd-chat-speaker'>
                  {message.role === 'user' ? 'You' : 'Firstday'}
                </span>
                <p>{message.text}</p>
                {message.answer?.citations && (
                  <div className='fd-chat-citations'>
                    {message.answer.citations.map((citation, index) => {
                      const url = safeSource(citation.url);
                      const label = `${citation.name}${citation.page ? ` · Page ${citation.page}` : ''}`;
                      return url ? (
                        <a
                          key={index}
                          href={url}
                          target='_blank'
                          rel='noopener noreferrer'
                          aria-label={`Open ${label} in a new tab`}
                        >
                          {label}
                          <ArrowUpRight size={13} aria-hidden='true' />
                        </a>
                      ) : (
                        <span key={index}>{label} · Link unavailable</span>
                      );
                    })}
                  </div>
                )}
              </div>
            ))}
            {busy && (
              <div className='fd-chat-message fd-chat-assistant fd-chat-stream'>
                <span className='fd-chat-speaker'>Firstday</span>
                {partial ? (
                  <p
                    className='fd-chat-stream-text'
                    aria-live='off'
                    aria-busy='true'
                  >
                    {partial}
                    <span className='fd-chat-cursor' aria-hidden='true' />
                  </p>
                ) : (
                  <p className='fd-chat-answering' role='status'>
                    <span className='fd-chat-pulse' aria-hidden='true' />
                    Answering…
                  </p>
                )}
                <button className='fd-text-button' onClick={stop}>
                  Stop reply
                </button>
              </div>
            )}
            {error && (
              <div className='fd-chat-error' role='alert'>
                <p>{error}</p>
                <button
                  className='fd-button secondary'
                  disabled={!ready || busy}
                  onClick={() => void send(failedQuestion, true)}
                >
                  Retry question
                </button>
              </div>
            )}
          </div>
          {!ready && (
            <div className='fd-chat-status' role='status'>
              {status === 'loading' ? (
                'Checking your sign-in…'
              ) : status !== 'authenticated' ? (
                <>
                  <p>Sign in with EAI to ask a question.</p>
                  <button
                    className='fd-button secondary'
                    onClick={() =>
                      void signIn('microsoft-entra-id', {
                        callbackUrl: window.location.href,
                      })
                    }
                  >
                    Sign in with EAI
                  </button>
                </>
              ) : runtime === null ? (
                'Getting the assistant ready…'
              ) : (
                <>
                  <p>
                    The assistant is not connected yet. Ask your administrator
                    to check its setup.
                  </p>
                  {onConnection && (
                    <button
                      className='fd-button secondary'
                      onClick={onConnection}
                    >
                      View setup
                    </button>
                  )}
                </>
              )}
            </div>
          )}
          <form
            className='fd-chat-form'
            onSubmit={(event) => {
              event.preventDefault();
              void send(question);
            }}
          >
            <label className='fd-sr-only' htmlFor='firstday-question'>
              Your question
            </label>
            <textarea
              ref={composer}
              id='firstday-question'
              rows={2}
              maxLength={1000}
              value={question}
              placeholder='Ask a question…'
              disabled={!ready || busy}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void send(question);
                }
              }}
            />
            <button
              className='fd-icon-button'
              type='submit'
              aria-label='Send question'
              disabled={!ready || busy || !question.trim()}
            >
              <Send size={19} />
            </button>
          </form>
          <p className='fd-chat-footer'>
            Check important details with HR. Shift + Enter adds a new line.
          </p>
        </section>
      )}
    </>
  );
}
