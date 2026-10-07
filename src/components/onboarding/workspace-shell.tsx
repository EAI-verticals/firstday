'use client';

import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useSession, signIn, signOut } from 'next-auth/react';
import { ArrowUpRight, Menu, X, type LucideIcon } from 'lucide-react';
import { FirstdayLogo } from './firstday-logo';
import type { WorkspaceRole } from '@/lib/onboarding/roles';

interface NavItem {
  id: string;
  label: string;
  Icon: LucideIcon;
  badge?: string;
}
interface Props {
  role: WorkspaceRole;
  page: string;
  title: string;
  navigation: readonly NavItem[];
  onNavigate: (page: string) => void;
  onChangeRole?: () => void;
  preview?: boolean;
  children: ReactNode;
}

export function WorkspaceShell({
  role,
  page,
  title,
  navigation,
  onNavigate,
  onChangeRole,
  preview = false,
  children,
}: Props): ReactNode {
  const [menuOpen, setMenuOpen] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const menuButtonRef = useRef<HTMLButtonElement>(null);
  const { data: session, status } = useSession();
  const displayName = session?.user?.name || 'Your account';
  useEffect(() => {
    if (!menuOpen) return;
    const sidebar = sidebarRef.current;
    const menuButton = menuButtonRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    sidebar?.querySelector<HTMLButtonElement>('.fd-mobile-close')?.focus();
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setMenuOpen(false);
      }
      if (event.key !== 'Tab' || !sidebar) return;
      const controls = Array.from(
        sidebar.querySelectorAll<HTMLElement>('button, a[href]'),
      ).filter((element) => element.getClientRects().length > 0);
      const first = controls[0];
      const last = controls[controls.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last?.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first?.focus();
      }
    };
    const onResize = (): void => {
      if (window.innerWidth > 780) setMenuOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    window.addEventListener('resize', onResize);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('resize', onResize);
      menuButton?.focus();
    };
  }, [menuOpen]);
  return (
    <div className='fd-shell ew-app'>
      <a className='fd-skip' href='#onboarding-main'>
        Skip to content
      </a>
      <aside
        id='firstday-navigation'
        ref={sidebarRef}
        className={`fd-sidebar ${menuOpen ? 'is-open' : ''}`}
        role={menuOpen ? 'dialog' : undefined}
        aria-modal={menuOpen ? true : undefined}
        aria-label={`${role} navigation`}
      >
        <div className='fd-brand-row'>
          <button
            type='button'
            className='fd-brand'
            aria-label='Firstday Home'
            onClick={() => {
              if (navigation[0]) onNavigate(navigation[0].id);
              setMenuOpen(false);
            }}
          >
            <FirstdayLogo /> Firstday
          </button>
          <button
            type='button'
            className='fd-mobile-close fd-icon-button'
            aria-label='Close navigation'
            onClick={() => setMenuOpen(false)}
          >
            <X size={20} aria-hidden='true' />
          </button>
        </div>
        <p className='fd-role-label'>
          {role.charAt(0).toUpperCase() + role.slice(1)}
        </p>
        <nav aria-label={`${role} navigation`}>
          {navigation.map(({ id, label, Icon, badge }) => (
            <button
              type='button'
              key={id}
              aria-current={page === id ? 'page' : undefined}
              onClick={() => {
                onNavigate(id);
                setMenuOpen(false);
              }}
            >
              <Icon size={19} aria-hidden='true' />
              <span>{label}</span>
              {badge && <small>{badge}</small>}
            </button>
          ))}
        </nav>
        <div className='fd-sidebar-bottom'>
          {onChangeRole && (
            <button type='button' onClick={onChangeRole}>
              Change role <ArrowUpRight size={16} aria-hidden='true' />
            </button>
          )}
          <div className='fd-account'>
            <span className='fd-avatar'>
              {displayName.slice(0, 1).toUpperCase()}
            </span>
            <div>
              <b>{displayName}</b>
              <small>
                {status === 'authenticated' ? 'Signed in' : 'Not signed in'}
              </small>
            </div>
          </div>
        </div>
      </aside>
      {menuOpen && (
        <button
          type='button'
          className='fd-nav-backdrop'
          aria-hidden='true'
          tabIndex={-1}
          onClick={() => setMenuOpen(false)}
        />
      )}
      <div className='fd-body'>
        <header className='fd-topbar'>
          <div>
            <button
              type='button'
              ref={menuButtonRef}
              className='fd-mobile-menu fd-icon-button'
              aria-label='Open navigation'
              aria-controls='firstday-navigation'
              aria-expanded={menuOpen}
              onClick={() => setMenuOpen(true)}
            >
              <Menu size={21} aria-hidden='true' />
            </button>
            <span className='fd-breadcrumb'>
              <b>{title}</b>
            </span>
          </div>
          <div className='fd-top-actions'>
            <span className='fd-preview-badge'>
              {preview ? 'Demo' : role.charAt(0).toUpperCase() + role.slice(1)}
            </span>
            {status === 'authenticated' ? (
              <button
                onClick={() =>
                  void signOut({
                    callbackUrl: process.env.NEXT_PUBLIC_APP_BASE_PATH || '/',
                  })
                }
              >
                Sign out
              </button>
            ) : (
              <button
                onClick={() =>
                  void signIn('microsoft-entra-id', {
                    callbackUrl: window.location.href,
                  })
                }
              >
                Sign in <ArrowUpRight size={14} />
              </button>
            )}
          </div>
        </header>
        {preview && (
          <div className='fd-session-note'>
            <span className='fd-status-dot' />
            Local demo: use synthetic details and documents. Live sharing and
            email invitations are not connected.
          </div>
        )}
        <main id='onboarding-main' tabIndex={-1} className='fd-main ew-main'>
          {children}
        </main>
      </div>
    </div>
  );
}
