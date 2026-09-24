/**
 * Same-origin API helpers for client-side code.
 *
 * Both `fetch()` and the platform-SDK list response shape leak Next.js
 * basePath / PayloadCMS pagination details into app pages. These two
 * helpers absorb that so page code can stay short and uniform.
 */

/**
 * Prepend NEXT_PUBLIC_APP_BASE_PATH to a same-origin API path so client-side
 * `fetch()` works under Next.js basePath. No-op when empty (root mount).
 *
 * @example
 *   await fetch(apiUrl(`/api/my-app/whatever?id=${id}`));
 */
export function apiUrl(path: string): string {
  const basePath = (process.env.NEXT_PUBLIC_APP_BASE_PATH ?? '').replace(/\/+$/, '');
  return `${basePath}${path.startsWith('/') ? path : `/${path}`}`;
}

/**
 * Unwrap a paginated list response into a plain array.
 *
 * The platform SDK's `PaginatedResponse` returns `docs` (PayloadCMS shape).
 * Older shims surfaced `data` or `items`. Page-level code shouldn't have to
 * remember which env it's running against — call this and forget.
 *
 * Returns `[]` for any unexpected shape so callers can render an empty state
 * instead of crashing.
 */
export function unwrapList<T>(response: unknown): T[] {
  if (!response || typeof response !== 'object') return [];
  const r = response as { docs?: unknown; data?: unknown; items?: unknown };
  if (Array.isArray(r.docs)) return r.docs as T[];
  if (Array.isArray(r.data)) return r.data as T[];
  if (Array.isArray(r.items)) return r.items as T[];
  return [];
}
