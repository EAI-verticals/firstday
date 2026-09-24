import { NextRequest, NextResponse } from 'next/server';

import {
  readBoundedJsonBody,
  RequestBodyTooLargeError,
} from '@/lib/generated-workflow/bounded-body';
import {
  requestClientFingerprint,
  validateSubmissionPatch,
} from '@/lib/generated-workflow/public-guards';
import { generatedWorkflowPlatformFetch } from '@/lib/generated-workflow/platform';
import { getGeneratedWorkflowRuntime } from '@/lib/generated-workflow/runtime';
import { readOwnedSubmission } from '@/lib/generated-workflow/submission-store';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const revalidate = 0;

interface RouteContext {
  params: Promise<{ submissionId: string }>;
}

const NO_STORE_HEADERS = {
  'Cache-Control': 'no-store, no-cache',
  'X-Content-Type-Options': 'nosniff',
};
const SUBMISSION_ID_PATTERN = /^[A-Za-z0-9_-]{1,160}$/;

function notFound(): NextResponse {
  return NextResponse.json(
    { error: 'SUBMISSION_NOT_FOUND' },
    { status: 404, headers: NO_STORE_HEADERS },
  );
}

async function routeContext(
  request: NextRequest,
  context: RouteContext,
  operation: string,
) {
  const resolved = getGeneratedWorkflowRuntime();
  if (resolved.status !== 'ready') return null;
  const { submissionId } = await context.params;
  if (!SUBMISSION_ID_PATTERN.test(submissionId)) return null;
  return {
    anonymousClientId:
      operation === 'update'
        ? requestClientFingerprint(request.headers)
        : undefined,
    runtime: resolved.runtime,
    submissionId,
  };
}

/** Resumes only the submission owned by the browser's signed HttpOnly capability. */
export async function GET(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const route = await routeContext(request, context, 'read');
    if (!route) return notFound();
    const stored = await readOwnedSubmission({
      request,
      runtime: route.runtime,
      submissionId: route.submissionId,
    });
    if (!stored) return notFound();

    return NextResponse.json(
      {
        submission: {
          id: stored.id,
          status: stored.status,
          currentStep: stored.currentStep,
          formData: stored.formData ?? {},
          userName: stored.userName ?? '',
          userEmail: stored.userEmail ?? '',
        },
      },
      { headers: NO_STORE_HEADERS },
    );
  } catch (error) {
    console.error(
      '[generated-workflow] submission read error:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      { error: 'SUBMISSION_READ_FAILED' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}

/** Autosaves or completes a cookie-owned anonymous submission via PublicAPI. */
export async function PATCH(
  request: NextRequest,
  context: RouteContext,
): Promise<NextResponse> {
  try {
    const route = await routeContext(request, context, 'update');
    if (!route) return notFound();
    let body: unknown;
    try {
      body = await readBoundedJsonBody(request);
    } catch (error) {
      return NextResponse.json(
        {
          error:
            error instanceof RequestBodyTooLargeError
              ? 'PAYLOAD_TOO_LARGE'
              : 'INVALID_BODY',
        },
        {
          status: error instanceof RequestBodyTooLargeError ? 413 : 400,
          headers: NO_STORE_HEADERS,
        },
      );
    }
    const parsed = validateSubmissionPatch(body);
    if (!parsed.ok) {
      return NextResponse.json(
        { error: 'INVALID_BODY', message: parsed.message },
        { status: 400, headers: NO_STORE_HEADERS },
      );
    }

    const stored = await readOwnedSubmission({
      request,
      runtime: route.runtime,
      submissionId: route.submissionId,
    });
    if (!stored) return notFound();
    if (stored.status === 'completed' || stored.status === 'abandoned') {
      return NextResponse.json(
        { error: 'SUBMISSION_FINALIZED' },
        { status: 409, headers: NO_STORE_HEADERS },
      );
    }

    const updateResponse = await generatedWorkflowPlatformFetch({
      tenantId: route.runtime.tenantId,
      appKey: route.runtime.appKey,
      path: `/submissions/${encodeURIComponent(route.submissionId)}`,
      anonymousClientId: route.anonymousClientId,
      init: {
        method: 'PATCH',
        body: JSON.stringify(parsed.value),
      },
    });
    if (!updateResponse.ok) {
      if (updateResponse.status === 429) {
        return NextResponse.json(
          { error: 'RATE_LIMITED' },
          { status: 429, headers: NO_STORE_HEADERS },
        );
      }
      console.error(
        '[generated-workflow] submission update failed:',
        updateResponse.status,
      );
      return NextResponse.json(
        { error: 'SUBMISSION_UPDATE_FAILED' },
        { status: 502, headers: NO_STORE_HEADERS },
      );
    }
    return NextResponse.json({ success: true }, { headers: NO_STORE_HEADERS });
  } catch (error) {
    console.error(
      '[generated-workflow] submission update error:',
      error instanceof Error ? error.name : 'unknown',
    );
    return NextResponse.json(
      { error: 'SUBMISSION_UPDATE_FAILED' },
      { status: 500, headers: NO_STORE_HEADERS },
    );
  }
}
