'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { signOut } from 'next-auth/react';
import { useClearPersistedStore, resetForLogout } from '@enterpriseaigroup/core';

/**
 * Clears all browser storage including localStorage, sessionStorage, and cache storage.
 * Also clears IndexedDB databases (including cached data).
 */
async function clearAllBrowserStorage(): Promise<void> {
  // Clear Zustand persisted store explicitly first
  sessionStorage.removeItem('eai-global-store');

  localStorage.clear();
  sessionStorage.clear();

  // Clear Cache Storage (used by service workers etc.)
  if ('caches' in window) {
    try {
      const cacheNames = await caches.keys();
      await Promise.all(cacheNames.map((name) => caches.delete(name)));
    } catch {
      // Silently ignore cache storage errors
    }
  }

  // Clear IndexedDB databases (apps may store data here)
  if ('indexedDB' in window) {
    try {
      const databases = await indexedDB.databases();
      for (const db of databases) {
        if (db.name) {
          indexedDB.deleteDatabase(db.name);
        }
      }
    } catch {
      // Silently ignore IndexedDB errors
    }
  }
}

/**
 * Sign-out completion page.
 *
 * This page is reached after Microsoft Entra has logged out the user.
 * It clears the client-side session and browser storage, then redirects home.
 */
export default function SignoutPage() {
  const router = useRouter();
  const clearPersistedStore = useClearPersistedStore();

  useEffect(() => {
    const completeSignout = async () => {
      try {
        // 1. Clear the Zustand persisted store properly (prevents re-writing)
        clearPersistedStore();

        // 2. Reset in-memory stores (Zustand etc)
        resetForLogout();

        // 3. Clear all browser storage
        await clearAllBrowserStorage();

        // 4. Clear Auth.js session cookie
        await signOut({ redirectTo: '/' });
      } catch {
        router.push('/');
      }
    };

    completeSignout();
  }, [router, clearPersistedStore]);

  return (
    <div className='bg-opacity-90 fixed inset-0 z-50 flex items-center justify-center bg-white'>
      <div className='text-center'>
        <div className='mb-4 inline-block h-20 w-20 animate-spin rounded-full border-t-2 border-b-2 border-gray-500'></div>
        <p className='font-geist mt-4 text-[14px] font-semibold text-gray-600'>
          Signing you out...
        </p>
      </div>
    </div>
  );
}
