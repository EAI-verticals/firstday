'use client';

import type { ReactNode } from 'react';
import { ArrowRight, UserRound, UsersRound } from 'lucide-react';
import { FirstdayLogo } from './firstday-logo';
import type { WorkspaceRole } from '@/lib/onboarding/roles';

interface Props {
  onSelect: (role: WorkspaceRole) => void;
  localPreview: boolean;
}

const CHOICES = [
  {
    role: 'employee',
    title: 'Employee',
    description: 'Add your details, upload documents and sign your pay terms.',
    Icon: UserRound,
  },
  {
    role: 'admin',
    title: 'Admin',
    description: 'Prepare hires, review onboarding and manage app settings.',
    Icon: UsersRound,
  },
] as const;

export function RoleChooser({ onSelect, localPreview }: Props): ReactNode {
  return (
    <main className='rw-chooser fd-chooser'>
      <div className='rw-chooser-inner'>
        <header className='fd-chooser-header'>
          <p className='rw-chooser-brand'>
            <FirstdayLogo />
            Firstday
          </p>
          <span className='fd-chooser-label'>Employee onboarding</span>
        </header>
        <div className='rw-chooser-heading'>
          <h1>Choose your role</h1>
          <p>Select Employee or Admin.</p>
        </div>
        <div className='rw-chooser-grid'>
          {CHOICES.map(({ role, title, description, Icon }) => (
            <button
              className='rw-choice'
              key={role}
              type='button'
              onClick={() => onSelect(role)}
            >
              <span className='rw-choice-icon'>
                <Icon size={22} aria-hidden='true' />
              </span>
              <span className='rw-choice-title'>{title}</span>
              <span className='rw-choice-description'>{description}</span>
              <span className='rw-choice-action'>
                Open
                <ArrowRight size={17} aria-hidden='true' />
              </span>
            </button>
          ))}
        </div>
        <p className='rw-chooser-note'>
          {localPreview
            ? 'Demo: you can switch roles without losing progress in this tab.'
            : 'Your account determines which roles you can access.'}
        </p>
      </div>
    </main>
  );
}
