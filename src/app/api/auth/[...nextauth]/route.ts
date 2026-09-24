import { NextRequest } from 'next/server';
import { handlers } from '@/auth';

// Auth.js v5 + Next.js basePath workaround.
//
// When APP_BASE_PATH is set (e.g. "/my-app"), Next.js strips that
// prefix from req.url before route handlers run. With AUTH_URL set to the
// full path (`http://localhost:3000/my-app/api/auth`), Auth.js's
// internal parser (parseActionAndProviderId) expects URLs to start with
// `/my-app/api/auth`, but actually sees `/api/auth/...` →
// throws UnknownAction.
//
// We re-prepend APP_BASE_PATH to the URL we hand to Auth.js so its parser
// matches. Outgoing URLs (callback_url to Entra, sign-in redirects) are
// already constructed correctly from AUTH_URL — those don't need fixing.
//
// If APP_BASE_PATH is empty (app mounted at host root), this is a no-op.
//
// Upstream: https://github.com/nextauthjs/next-auth/issues/9722
const APP_BASE_PATH = (process.env.APP_BASE_PATH ?? '').replace(/\/+$/, '');

function rewrite(req: NextRequest): NextRequest {
  if (!APP_BASE_PATH) return req;
  const url = new URL(req.url);
  if (
    url.pathname.startsWith('/api/auth/') &&
    !url.pathname.startsWith(`${APP_BASE_PATH}/api/auth/`)
  ) {
    url.pathname = `${APP_BASE_PATH}${url.pathname}`;
    return new NextRequest(url, req);
  }
  return req;
}

export const GET = (req: NextRequest) => handlers.GET(rewrite(req));
export const POST = (req: NextRequest) => handlers.POST(rewrite(req));
