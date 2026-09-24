import { auth } from '@/auth';

export async function GET() {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  let redirectUrl = baseUrl;

  console.log('[entra-logout] Starting logout, baseUrl:', baseUrl);

  try {
    const session = await auth();
    console.log('[entra-logout] Session:', session ? 'exists' : 'null');

    if (session) {
      const entraTenantName = process.env.ENTRA_TENANT_NAME;
      const entraTenantId = process.env.ENTRA_TENANT_ID;
      console.log('[entra-logout] Tenant config:', { entraTenantName: !!entraTenantName, entraTenantId: !!entraTenantId });

      if (entraTenantName && entraTenantId) {
        const endSessionUrl = `https://${entraTenantName}.ciamlogin.com/${entraTenantId}/oauth2/v2.0/logout`;
        const postLogoutRedirectUri = `${baseUrl}/auth/signout`;

        const params = new URLSearchParams({
          post_logout_redirect_uri: postLogoutRedirectUri,
        });

        redirectUrl = `${endSessionUrl}?${params.toString()}`;
        console.log('[entra-logout] Built logout URL');
      } else {
        redirectUrl = `${baseUrl}/auth/signout`;
        console.log('[entra-logout] Missing tenant config, using signout page');
      }
    } else {
      console.log('[entra-logout] No session, using baseUrl');
    }
  } catch (error) {
    console.error('[entra-logout] Error:', error);
  }

  console.log('[entra-logout] Returning URL:', redirectUrl);
  return Response.json({ url: redirectUrl });
}
