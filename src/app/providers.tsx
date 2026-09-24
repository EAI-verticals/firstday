'use client';

import { type ReactNode } from 'react';
import { SessionProvider } from 'next-auth/react';
import { DemoProvider } from '@enterpriseaigroup/demo';
import type { EAIConfig } from '@enterpriseaigroup/core';

interface ProvidersProps {
  children: ReactNode;
  tenants: Record<string, EAIConfig>;
}

// next-auth/react's signIn / signOut / useSession use a raw fetch() that
// does NOT respect Next.js basePath. Without this, signIn() from the
// browser fetches /api/auth/csrf (no APP_BASE_PATH prefix) → 404 →
// next-auth falls back to redirecting the browser to /api/auth/error.
// SessionProvider basePath fixes the client-side fetch URLs.
//
// Read from a NEXT_PUBLIC_* env var since APP_BASE_PATH is server-only.
// No-op when empty (root mount).
const NEXT_PUBLIC_BASE_PATH = (
  process.env.NEXT_PUBLIC_APP_BASE_PATH ?? ''
).replace(/\/+$/, '');
const SESSION_BASE_PATH = `${NEXT_PUBLIC_BASE_PATH}/api/auth`;
// DemoProvider also fetches its runtime config via raw fetch() — same
// basePath caveat. Default endpoint is /api/eai/config; prefix it.
const RUNTIME_CONFIG_ENDPOINT = `${NEXT_PUBLIC_BASE_PATH}/api/eai/config`;

export function Providers({ children, tenants }: ProvidersProps) {
  return (
    <SessionProvider basePath={SESSION_BASE_PATH}>
      <DemoProvider
        tenants={tenants}
        runtimeConfigEndpoint={RUNTIME_CONFIG_ENDPOINT}
      >
        {children}
      </DemoProvider>
    </SessionProvider>
  );
}
