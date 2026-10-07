import { getOnboardingRuntime } from './runtime';

describe('onboarding AI runtime configuration', () => {
  it('fails closed when tenant or workflow is absent', () => {
    expect(getOnboardingRuntime({}).configured).toBe(false);
    expect(
      getOnboardingRuntime({ EAI_TENANT_ID: 'workspace' }).configured,
    ).toBe(false);
    expect(
      getOnboardingRuntime({ WORKFLOW_ONBOARDING_ID: 'onboarding' }).configured,
    ).toBe(false);
  });
  it('returns only public routing identifiers and supports the existing workflow key', () => {
    const result = getOnboardingRuntime({
      EAI_TENANT_ID: 'workspace',
      WORKFLOW_VENDING_MACHINE_APP_ID: 'onboarding',
      EAI_APP_KEY: 'test-onboarding-app',
      AUTH_SECRET: 'never-return',
      ENTRA_CLIENT_SECRET: 'never-return',
    });
    expect(result.configured).toBe(true);
    expect(result.appKey).toBe('test-onboarding-app');
    expect(result.documents.appKey).toBe(result.appKey);
    expect(result.stages).toEqual({
      answer: 'answer',
      generate: 'generate',
      review: 'review',
    });
    expect(JSON.stringify(result)).not.toContain('never-return');
  });
});
