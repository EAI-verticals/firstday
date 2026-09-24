import { createHash, createHmac, timingSafeEqual } from 'node:crypto';
import type { NextRequest, NextResponse } from 'next/server';

const LEGACY_COOKIE_NAME = 'eai_generated_workflow_submission';
const COOKIE_NAME_PREFIX = `${LEGACY_COOKIE_NAME}_`;
const MAX_SESSION_AGE_SECONDS = 7 * 24 * 60 * 60;
const MAX_ACTIVE_SUBMISSION_COOKIES = 8;

interface SubmissionSession {
  submissionId: string;
  workflowDigest: string;
  expiresAt: number;
}

function sessionSecret(): string {
  const secret = process.env.EAI_GENERATED_WORKFLOW_SESSION_SECRET?.trim();
  if (!secret) {
    throw new Error('Anonymous workflow submission secret is not configured.');
  }
  return secret;
}

function submissionCookieName(submissionId: string): string {
  const identifier = createHash('sha256')
    .update(submissionId, 'utf8')
    .digest('base64url');
  return `${COOKIE_NAME_PREFIX}${identifier}`;
}

function signature(payload: string): Buffer {
  return createHmac('sha256', sessionSecret()).update(payload).digest();
}

function encodeSession(session: SubmissionSession): string {
  const payload = Buffer.from(JSON.stringify(session), 'utf8').toString(
    'base64url',
  );
  return `${payload}.${signature(payload).toString('base64url')}`;
}

function decodeSession(value: string | undefined): SubmissionSession | null {
  if (!value) return null;
  const [payload, encodedSignature, extra] = value.split('.');
  if (!payload || !encodedSignature || extra) return null;
  const supplied = Buffer.from(encodedSignature, 'base64url');
  const expected = signature(payload);
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  ) {
    return null;
  }
  try {
    const decoded = JSON.parse(
      Buffer.from(payload, 'base64url').toString('utf8'),
    ) as Partial<SubmissionSession>;
    if (
      typeof decoded.submissionId !== 'string' ||
      typeof decoded.workflowDigest !== 'string' ||
      typeof decoded.expiresAt !== 'number' ||
      decoded.expiresAt <= Date.now()
    ) {
      return null;
    }
    return decoded as SubmissionSession;
  } catch {
    return null;
  }
}

function pruneSubmissionCookies(
  response: NextResponse,
  request: NextRequest,
  activeCookieName: string,
): void {
  const validCookies = request.cookies
    .getAll()
    .filter(
      (cookie) =>
        cookie.name.startsWith(COOKIE_NAME_PREFIX) &&
        cookie.name !== activeCookieName,
    )
    .flatMap((cookie, index) => {
      const session = decodeSession(cookie.value);
      if (!session) {
        response.cookies.delete(cookie.name);
        return [];
      }
      return [{ name: cookie.name, expiresAt: session.expiresAt, index }];
    })
    .sort(
      (left, right) =>
        right.expiresAt - left.expiresAt || right.index - left.index,
    );

  for (const cookie of validCookies.slice(MAX_ACTIVE_SUBMISSION_COOKIES - 1)) {
    response.cookies.delete(cookie.name);
  }
}

/** Issues an HttpOnly ownership capability for one anonymous submission. */
export function setSubmissionSession(
  response: NextResponse,
  submissionId: string,
  workflowDigest: string,
  request?: NextRequest,
): void {
  const cookieName = submissionCookieName(submissionId);
  if (request) pruneSubmissionCookies(response, request, cookieName);
  response.cookies.set({
    name: cookieName,
    value: encodeSession({
      submissionId,
      workflowDigest,
      expiresAt: Date.now() + MAX_SESSION_AGE_SECONDS * 1000,
    }),
    httpOnly: true,
    maxAge: MAX_SESSION_AGE_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

/** Confirms the browser owns the submission without exposing a platform token. */
export function hasSubmissionSession(
  request: NextRequest,
  submissionId: string,
  workflowDigest: string,
): boolean {
  const session = decodeSession(
    request.cookies.get(submissionCookieName(submissionId))?.value ??
      request.cookies.get(LEGACY_COOKIE_NAME)?.value,
  );
  return Boolean(
    session &&
    session.submissionId === submissionId &&
    session.workflowDigest === workflowDigest,
  );
}
