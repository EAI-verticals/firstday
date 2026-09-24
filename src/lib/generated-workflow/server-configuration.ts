const REQUIRED_SERVER_ENV = [
  'EAI_PLATFORM_TOKEN_AUDIENCE',
  'AZURE_CLIENT_ID',
  'IDENTITY_ENDPOINT',
  'IDENTITY_HEADER',
  'EAI_GENERATED_WORKFLOW_SESSION_SECRET',
] as const;

/** Reports names only for missing conditional BFF settings; values never leave the server. */
export function generatedWorkflowServerConfigurationErrors(
  env: NodeJS.ProcessEnv = process.env,
): string[] {
  const errors: string[] = REQUIRED_SERVER_ENV.filter(
    (name) => !env[name]?.trim(),
  );
  const platformBaseUrl =
    env.EAI_PLATFORM_API_BASE_URL?.trim() || env.BASE_URL_PUBLIC_API?.trim();
  if (!platformBaseUrl) {
    errors.push('EAI_PLATFORM_API_BASE_URL|BASE_URL_PUBLIC_API');
  }
  const submissionSecret = env.EAI_GENERATED_WORKFLOW_SESSION_SECRET?.trim();
  if (submissionSecret && submissionSecret.length < 32) {
    errors.push('EAI_GENERATED_WORKFLOW_SESSION_SECRET');
  }
  if (platformBaseUrl) {
    try {
      const url = new URL(platformBaseUrl);
      if (url.protocol !== 'http:' && url.protocol !== 'https:') {
        errors.push('EAI_PLATFORM_API_BASE_URL|BASE_URL_PUBLIC_API');
      }
    } catch {
      errors.push('EAI_PLATFORM_API_BASE_URL|BASE_URL_PUBLIC_API');
    }
  }
  return Array.from(new Set(errors)).sort();
}
