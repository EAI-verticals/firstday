import type { JWT } from 'next-auth/jwt';

export interface MicrosoftTokenConfig {
  tokenUrl: string;
  clientId: string;
  clientSecret: string;
  scope: string;
}

export function microsoftTokenConfig(): MicrosoftTokenConfig {
  const tenant = process.env.ENTRA_TENANT_ID || 'placeholder';
  const name = process.env.ENTRA_TENANT_NAME || 'placeholder';
  const scopes = new Set(
    (process.env.ENTRA_SCOPES || 'openid profile email')
      .split(/\s+/)
      .filter(Boolean),
  );
  scopes.add('offline_access');
  return {
    tokenUrl: `https://${name}.ciamlogin.com/${tenant}/oauth2/v2.0/token`,
    clientId: process.env.ENTRA_CLIENT_ID || 'placeholder',
    clientSecret: process.env.ENTRA_CLIENT_SECRET || 'placeholder',
    scope: [...scopes].join(' '),
  };
}

const refreshing = new Map<string, Promise<Partial<JWT>>>();
const EXPIRY_BUFFER_MS = 60_000;

function unavailable(token: JWT): JWT {
  return {
    ...token,
    accessToken: undefined,
    accessTokenExpires: 0,
    error: 'RefreshAccessTokenError',
  };
}

/** Shared by Auth.js and the EAI proxy. Never returns an expired bearer token. */
export async function refreshMicrosoftSession(
  token: JWT,
  config: MicrosoftTokenConfig = microsoftTokenConfig(),
): Promise<JWT> {
  if (
    token.accessToken &&
    token.accessTokenExpires &&
    token.accessTokenExpires > Date.now() + EXPIRY_BUFFER_MS &&
    !token.error
  )
    return token;
  if (!token.refreshToken) return unavailable(token);
  const key = JSON.stringify([
    config.tokenUrl,
    config.clientId,
    token.refreshToken,
  ]);
  let pending = refreshing.get(key);
  if (!pending) {
    pending = (async (): Promise<Partial<JWT>> => {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);
      try {
        const response = await fetch(config.tokenUrl, {
          method: 'POST',
          cache: 'no-store',
          signal: controller.signal,
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            grant_type: 'refresh_token',
            refresh_token: token.refreshToken!,
            scope: config.scope,
          }),
        });
        const value: unknown = await response.json();
        if (!response.ok || !value || typeof value !== 'object')
          throw new Error('Refresh unavailable');
        const payload = value as Record<string, unknown>;
        if (
          typeof payload.access_token !== 'string' ||
          !payload.access_token ||
          typeof payload.expires_in !== 'number' ||
          !Number.isFinite(payload.expires_in) ||
          payload.expires_in <= 60
        )
          throw new Error('Invalid token response');
        return {
          accessToken: payload.access_token,
          accessTokenExpires: Date.now() + payload.expires_in * 1000,
          refreshToken:
            typeof payload.refresh_token === 'string' && payload.refresh_token
              ? payload.refresh_token
              : token.refreshToken,
          error: undefined,
        };
      } catch {
        // Do not log OAuth responses: they can contain credentials or personal claims.
        return {
          accessToken: undefined,
          accessTokenExpires: 0,
          error: 'RefreshAccessTokenError',
        };
      } finally {
        clearTimeout(timeout);
      }
    })();
    refreshing.set(key, pending);
    void pending.finally(() => {
      if (refreshing.get(key) === pending) refreshing.delete(key);
    });
  }
  // Share only refreshed credential fields, never one request's identity or roles.
  return { ...token, ...(await pending) };
}
