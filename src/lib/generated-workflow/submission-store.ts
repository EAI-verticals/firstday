import type { NextRequest } from 'next/server';

import { generatedWorkflowPlatformFetch } from './platform';
import { hasSubmissionSession } from './submission-session';
import type { GeneratedWorkflowRuntime } from './runtime-contract';

/** Minimal facade response exposed to the anonymous resume UI. */
export interface StoredSubmission {
  id: string;
  status?: unknown;
  currentStep?: unknown;
  formData?: unknown;
  userName?: unknown;
  userEmail?: unknown;
}

/** Reads a submission only after its HttpOnly ownership capability is verified. */
export async function readOwnedSubmission(args: {
  request: NextRequest;
  runtime: GeneratedWorkflowRuntime;
  submissionId: string;
}): Promise<StoredSubmission | null> {
  const { request, runtime, submissionId } = args;
  if (
    !hasSubmissionSession(
      request,
      submissionId,
      runtime.binding.workflowTemplate.digest,
    )
  ) {
    return null;
  }
  const response = await generatedWorkflowPlatformFetch({
    tenantId: runtime.tenantId,
    appKey: runtime.appKey,
    path: `/submissions/${encodeURIComponent(submissionId)}`,
  });
  if (!response.ok) return null;
  const payload = (await response.json()) as {
    submission?: Partial<StoredSubmission>;
  };
  const stored = payload.submission ?? {};
  if (typeof stored.id !== 'string' || stored.id !== submissionId) {
    return null;
  }
  return {
    id: submissionId,
    status: stored.status,
    currentStep: stored.currentStep,
    formData: stored.formData,
    userName: stored.userName,
    userEmail: stored.userEmail,
  };
}
