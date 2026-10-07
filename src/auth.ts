import NextAuth, { type DefaultSession } from 'next-auth';
import MicrosoftEntraID from 'next-auth/providers/microsoft-entra-id';
import {
  microsoftTokenConfig,
  refreshMicrosoftSession,
} from '@/lib/auth/token-lifecycle';
import {
  resolveWorkspaceRole,
  type WorkspaceRole,
} from '@/lib/onboarding/roles';

// Extend the built-in session types...
declare module 'next-auth' {
  interface Session {
    accessToken?: string;
    error?: 'RefreshAccessTokenError';
    user: {
      id: string;
      workspaceRole: WorkspaceRole;
    } & DefaultSession['user'];
  }
}

declare module 'next-auth/jwt' {
  interface JWT {
    accessToken?: string;
    refreshToken?: string;
    accessTokenExpires?: number;
    error?: 'RefreshAccessTokenError';
    name?: string;
    email?: string;
    workspaceRole?: WorkspaceRole;
  }
}

// Use placeholder values during build if env vars are not set
// This allows the build to succeed; actual auth will fail at runtime without real values
const tenantId = process.env.ENTRA_TENANT_ID || 'placeholder';
const tenantName = process.env.ENTRA_TENANT_NAME || 'placeholder';

// Azure returns tenant ID in issuer, but we use tenant name for auth/token endpoints
const issuerBaseUrl = `https://${tenantId}.ciamlogin.com/${tenantId}`;
const authBaseUrl = `https://${tenantName}.ciamlogin.com/${tenantId}`;

const entraConfig = {
  clientId: process.env.ENTRA_CLIENT_ID || 'placeholder',
  clientSecret: process.env.ENTRA_CLIENT_SECRET || 'placeholder',
  issuer: `${issuerBaseUrl}/v2.0`,
  scope: microsoftTokenConfig().scope,
  sessionMaxAge: parseInt(process.env.AUTH_SESSION_MAX_AGE || '86400', 10),
  defaultTokenExpiry: parseInt(
    process.env.AUTH_DEFAULT_TOKEN_EXPIRY || '3600',
    10,
  ),
};

const tokenUrl = `${authBaseUrl}/oauth2/v2.0/token`;
const authUrl = `${authBaseUrl}/oauth2/v2.0/authorize`;

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [
    MicrosoftEntraID({
      clientId: entraConfig.clientId,
      clientSecret: entraConfig.clientSecret,
      issuer: entraConfig.issuer,
      token: tokenUrl,
      authorization: {
        url: authUrl,
        params: {
          scope: entraConfig.scope,
        },
      },
    }),
  ],
  callbacks: {
    // Auth.js redirects (post-sign-in callbackUrl, sign-out redirectTo,
    // pages.signIn) live outside Next.js's <Link>/router and don't
    // automatically pick up basePath. Prepend APP_BASE_PATH to in-app
    // paths so callers can write `callbackUrl: '/dashboard'` and land
    // at `/my-app/dashboard` instead of `/dashboard` (which 404s).
    // No-op when APP_BASE_PATH is empty (root mount).
    async redirect({ url, baseUrl }) {
      const basePath = (process.env.APP_BASE_PATH ?? '').replace(/\/+$/, '');
      const fallback = `${baseUrl}${basePath}`;
      try {
        const target = new URL(url, baseUrl);
        if (target.origin !== new URL(baseUrl).origin) return fallback;
        if (
          basePath &&
          target.pathname !== basePath &&
          !target.pathname.startsWith(`${basePath}/`)
        ) {
          target.pathname = `${basePath}${target.pathname === '/' ? '' : target.pathname}`;
        }
        return target.toString();
      } catch {
        return fallback;
      }
    },
    async jwt({ token, account, user, profile }) {
      // Initial sign in
      if (account && user) {
        const newToken = {
          ...token,
          accessToken: account.access_token,
          refreshToken: account.refresh_token,
          accessTokenExpires: account.expires_at
            ? account.expires_at * 1000
            : Date.now() + entraConfig.defaultTokenExpiry * 1000,
          // Extract user profile claims from ID token
          name: user.name ?? undefined,
          email: user.email ?? undefined,
          workspaceRole: resolveWorkspaceRole(profile?.roles),
          error: account.access_token
            ? undefined
            : ('RefreshAccessTokenError' as const),
        };
        return newToken;
      }

      return refreshMicrosoftSession(token);
    },
    async session({ session, token }) {
      session.user.id = token.sub!;

      // Expose name and email from JWT token (extracted from ID token during sign-in)
      if (token.name) session.user.name = token.name;
      if (token.email) session.user.email = token.email;
      session.user.workspaceRole =
        token.workspaceRole === 'admin' ? 'admin' : 'employee';

      // Only include error status if token refresh failed
      session.error = token.error;

      // Note: accessToken is NOT included here - it stays server-side only in the JWT cookie.
      // Server-side code uses getServerAccessToken() which refreshes and rotates the encrypted cookie.

      return session;
    },
  },
  session: {
    strategy: 'jwt',
    maxAge: entraConfig.sessionMaxAge,
  },
  pages: {
    signIn: '/',
    error: '/auth/error',
  },
});
