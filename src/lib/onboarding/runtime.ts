export interface OnboardingRuntime {
  configured: boolean;
  workflowId: string;
  tenantId: string;
  appKey: string;
  stages: { answer: string; generate: string; review: string };
  reason?: string;
  documents: {
    tenantId: string;
    appKey: string;
    workflowKey: string;
    configured: boolean;
    mode: 'direct';
  };
}
/** Exposes routing identifiers only. Credentials remain in the existing EAI server proxy. */
export function getOnboardingRuntime(
  env: Record<string, string | undefined>,
): OnboardingRuntime {
  const workflowId = (
    env.WORKFLOW_ONBOARDING_ID ||
    env.WORKFLOW_VENDING_MACHINE_APP_ID ||
    ''
  ).trim();
  const tenantId = (
    env.NEXT_PUBLIC_EAI_TENANT_ID ||
    env.EAI_TENANT_ID ||
    env.TENANT_DEFAULT_ID ||
    ''
  ).trim();
  const configured = Boolean(workflowId && tenantId);
  const appKey =
    env.EAI_APP_KEY || env.NEXT_PUBLIC_APP_NAME || 'vending-machine-app';
  return {
    configured,
    appKey,
    documents: {
      mode: 'direct',
      tenantId,
      appKey,
      workflowKey: env.ONBOARDING_DOCUMENT_WORKFLOW_KEY || '',
      configured: Boolean(tenantId && env.ONBOARDING_DOCUMENT_WORKFLOW_KEY),
    },
    workflowId,
    tenantId,
    stages: {
      answer: env.WORKFLOW_ONBOARDING_ANSWER_STAGE || 'answer',
      generate: env.WORKFLOW_ONBOARDING_GENERATE_STAGE || 'generate',
      review: env.WORKFLOW_ONBOARDING_REVIEW_STAGE || 'review',
    },
    ...(configured
      ? {}
      : {
          reason:
            'The onboarding assistant has not been connected to its platform prompt and model profile yet.',
        }),
  };
}
