import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { ChatAssistant } from './chat-assistant';
import { askKnowledgeBase, type AiRuntime } from '@/lib/onboarding/ai';

let sessionStatus = 'authenticated';
jest.mock('next-auth/react', () => ({
  useSession: () => ({
    status: sessionStatus,
    data: { user: { id: 'test-user' } },
  }),
  signIn: jest.fn(),
}));
jest.mock('@/lib/onboarding/ai', () => ({ askKnowledgeBase: jest.fn() }));
const ask = jest.mocked(askKnowledgeBase);
const runtime: AiRuntime = {
  configured: true,
  tenantId: 'tenant',
  workflowId: 'workflow',
  stages: { answer: 'answer', generate: 'generate', review: 'review' },
};
beforeEach(() => {
  jest.clearAllMocks();
  sessionStatus = 'authenticated';
});

it('does not send until asked, retries a real failure and opens only safe citation links', async () => {
  ask.mockRejectedValueOnce(
    new Error('The AI service is unavailable right now. Please try again.'),
  );
  ask.mockImplementationOnce(async (_question, _runtime, onText) => {
    onText?.('Read the');
    return {
      text: 'Read the handbook.',
      citations: [
        {
          name: 'Handbook.pdf',
          page: 2,
          url: 'https://example.com/handbook.pdf#page=2',
        },
        { name: 'Unsafe.pdf', url: 'javascript:alert(1)' },
      ],
    };
  });
  render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  expect(ask).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'What should I read?' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  expect(await screen.findByRole('alert')).toHaveTextContent(
    'AI service is unavailable',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry question' }));
  await screen.findByText('Read the handbook.');
  expect(ask).toHaveBeenCalledTimes(2);
  expect(ask).toHaveBeenLastCalledWith(
    'What should I read?',
    runtime,
    expect.any(Function),
    [],
  );
  expect(screen.getAllByText('What should I read?')).toHaveLength(1);
  expect(
    screen.getByRole('link', {
      name: 'Open Handbook.pdf · Page 2 in a new tab',
    }),
  ).toHaveAttribute('href', 'https://example.com/handbook.pdf#page=2');
  expect(screen.getByText('Unsafe.pdf · Link unavailable')).toBeInTheDocument();
  expect(
    screen.queryByRole('link', { name: /Unsafe/ }),
  ).not.toBeInTheDocument();
});

it('closes with Escape and returns keyboard focus to the launcher', () => {
  render(<ChatAssistant runtime={runtime} />);
  const launcher = screen.getByRole('button', { name: 'Ask Firstday' });
  fireEvent.click(launcher);
  expect(screen.getByLabelText('Your question')).toHaveFocus();
  fireEvent.keyDown(window, { key: 'Escape' });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(launcher).toHaveFocus();
});

it('prevents AI requests when signed out and explains the next action', () => {
  sessionStatus = 'unauthenticated';
  render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  expect(
    screen.getByRole('button', { name: 'Sign in with EAI' }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Send question')).toBeDisabled();
  expect(ask).not.toHaveBeenCalled();
});

it('does not show a late answer after its component is removed', async () => {
  let finish: ((answer: { text: string }) => void) | undefined;
  ask.mockImplementationOnce(
    () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  );
  const { unmount } = render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  await waitFor(() => expect(ask).toHaveBeenCalled());
  unmount();
  finish?.({ text: 'Late answer' });
  expect(screen.queryByText('Late answer')).not.toBeInTheDocument();
});

it('discards partial and late text when the user stops a reply', async () => {
  let finish: ((answer: { text: string }) => void) | undefined;
  ask.mockImplementationOnce((_question, _runtime, onText) => {
    onText?.('Partial reply');
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  await screen.findByText('Partial reply');
  fireEvent.click(screen.getByRole('button', { name: 'Stop reply' }));
  finish?.({ text: 'Late answer' });
  expect(screen.queryByText('Partial reply')).not.toBeInTheDocument();
  expect(screen.queryByText('Late answer')).not.toBeInTheDocument();
  expect(screen.getByRole('alert')).toHaveTextContent('Reply stopped');
});

it('shows Answering then renders successive chunks before completing with a citation', async () => {
  let update: ((text: string) => void) | undefined;
  let finish:
    | ((answer: Awaited<ReturnType<typeof askKnowledgeBase>>) => void)
    | undefined;
  ask.mockImplementationOnce((_question, _runtime, onText) => {
    update = onText;
    return new Promise((resolve) => {
      finish = resolve;
    });
  });
  render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'Leave policy?' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  expect(screen.getByRole('status')).toHaveTextContent('Answering…');
  expect(screen.getByLabelText('Send question')).toBeDisabled();
  act(() => update?.('Request'));
  expect(screen.getByText('Request')).toBeInTheDocument();
  expect(screen.queryByText('Answering…')).not.toBeInTheDocument();
  act(() => update?.('Request leave from your manager.'));
  expect(
    screen.getByText('Request leave from your manager.'),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('button', { name: 'Stop reply' }),
  ).toBeInTheDocument();
  await act(async () =>
    finish?.({
      text: 'Request leave from your manager.',
      citations: [
        { name: 'Handbook', url: 'https://example.com/handbook.pdf' },
      ],
    }),
  );
  expect(screen.getAllByText('Request leave from your manager.')).toHaveLength(
    1,
  );
  expect(
    screen.getByRole('link', { name: 'Open Handbook in a new tab' }),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole('button', { name: 'Stop reply' }),
  ).not.toBeInTheDocument();
  expect(screen.getByLabelText('Your question')).toBeEnabled();
});

it('returns to Answering when an incomplete stream is cleared for fallback, then clears it on failure', async () => {
  let update: ((text: string) => void) | undefined;
  let fail: ((error: Error) => void) | undefined;
  ask.mockImplementationOnce((_question, _runtime, onText) => {
    update = onText;
    return new Promise((_resolve, reject) => {
      fail = reject;
    });
  });
  render(<ChatAssistant runtime={runtime} />);
  fireEvent.click(screen.getByRole('button', { name: 'Ask Firstday' }));
  fireEvent.change(screen.getByLabelText('Your question'), {
    target: { value: 'Hello' },
  });
  fireEvent.click(screen.getByLabelText('Send question'));
  act(() => update?.('Incomplete'));
  expect(screen.getByText('Incomplete')).toBeInTheDocument();
  act(() => update?.(''));
  expect(screen.queryByText('Incomplete')).not.toBeInTheDocument();
  expect(screen.getByRole('status')).toHaveTextContent('Answering…');
  await act(async () => fail?.(new Error('Service unavailable')));
  expect(screen.getByRole('alert')).toHaveTextContent('Service unavailable');
  expect(screen.queryByText('Answering…')).not.toBeInTheDocument();
  expect(screen.getByRole('button', { name: 'Retry question' })).toBeEnabled();
});
