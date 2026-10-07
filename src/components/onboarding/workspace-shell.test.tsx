import { fireEvent, render, screen, within } from '@testing-library/react';
import { Home, FileText } from 'lucide-react';
import { WorkspaceShell } from './workspace-shell';

jest.mock('next-auth/react', () => ({
  useSession: () => ({ data: null, status: 'unauthenticated' }),
  signIn: jest.fn(),
  signOut: jest.fn(),
}));
const navigation = [
  { id: 'overview', label: 'Overview', Icon: Home },
  { id: 'documents', label: 'Documents', Icon: FileText },
];

describe('Firstday workspace navigation', () => {
  it('uses role and page names without workspace jargon', () => {
    const { container } = render(
      <WorkspaceShell
        role='employee'
        page='overview'
        title='Home'
        navigation={navigation}
        onNavigate={jest.fn()}
        preview
      >
        <h1>Your tasks</h1>
      </WorkspaceShell>,
    );
    expect(
      screen.getByRole('navigation', { name: 'employee navigation' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Employee')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Sign in' })).toBeInTheDocument();
    expect(container).not.toHaveTextContent(/workspace|Sign in for AI/i);
  });
  it('shows the current page and closes a mobile navigation selection', () => {
    const onNavigate = jest.fn();
    render(
      <WorkspaceShell
        role='employee'
        page='overview'
        title='Overview'
        navigation={navigation}
        onNavigate={onNavigate}
        preview
      >
        <h1>Your onboarding</h1>
      </WorkspaceShell>,
    );
    expect(
      screen
        .getByRole('button', { name: 'Overview' })
        .getAttribute('aria-current'),
    ).toBe('page');
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(screen.getByRole('dialog').getAttribute('aria-modal')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'Documents' }));
    expect(onNavigate).toHaveBeenCalledWith('documents');
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.body.style.overflow).toBe('');
  });

  it('closes with Escape and restores focus to the menu button', () => {
    render(
      <WorkspaceShell
        role='admin'
        page='overview'
        title='Overview'
        navigation={navigation}
        onNavigate={jest.fn()}
      >
        <h1>Team onboarding</h1>
      </WorkspaceShell>,
    );
    const menu = screen.getByRole('button', { name: 'Open navigation' });
    fireEvent.click(menu);
    expect(document.activeElement).toBe(
      screen.getByRole('button', { name: 'Close navigation' }),
    );
    expect(document.body.style.overflow).toBe('hidden');
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(document.activeElement).toBe(menu);
    expect(document.body.style.overflow).toBe('');
  });

  it('keeps keyboard focus within the open mobile navigation', () => {
    const rectangles = jest
      .spyOn(HTMLElement.prototype, 'getClientRects')
      .mockReturnValue([{} as DOMRect] as unknown as DOMRectList);
    render(
      <WorkspaceShell
        role='employee'
        page='overview'
        title='Overview'
        navigation={navigation}
        onNavigate={jest.fn()}
        onChangeRole={jest.fn()}
      >
        <h1>Your onboarding</h1>
      </WorkspaceShell>,
    );
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const controls = within(screen.getByRole('dialog')).getAllByRole('button');
    const first = controls[0];
    const last = controls[controls.length - 1];
    first.focus();
    fireEvent.keyDown(document, { key: 'Tab', shiftKey: true });
    expect(document.activeElement).toBe(last);
    fireEvent.keyDown(document, { key: 'Tab' });
    expect(document.activeElement).toBe(first);
    rectangles.mockRestore();
  });
});
