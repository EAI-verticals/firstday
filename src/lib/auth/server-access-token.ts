import { encode, getToken } from 'next-auth/jwt';
import { serialize } from 'cookie';
import { refreshMicrosoftSession } from './token-lifecycle';

export interface ServerTokenSession {
  accessToken: string | null;
  setCookies: string[];
}

const COOKIE_CHUNK_SIZE = 3936; // Auth.js's 4096-byte limit minus cookie metadata.

/** Decode the existing Auth.js cookie and silently renew it for delegated EAI calls. */
export async function getServerAccessToken(
  request: Request,
): Promise<ServerTokenSession> {
  const secret = process.env.AUTH_SECRET;
  const empty: ServerTokenSession = { accessToken: null, setCookies: [] };
  if (!secret) return empty;
  const secure =
    new URL(process.env.AUTH_URL || request.url).protocol === 'https:';
  const cookieName = `${secure ? '__Secure-' : ''}authjs.session-token`;
  try {
    const token = await getToken({
      req: request,
      secret,
      secureCookie: secure,
      cookieName,
      salt: cookieName,
    });
    if (!token || !token.sub) return empty;
    const refreshed = await refreshMicrosoftSession(token);
    if (refreshed === token)
      return { accessToken: token.accessToken || null, setCookies: [] };
    const parsedMaxAge = Number(process.env.AUTH_SESSION_MAX_AGE || '86400');
    const maxAge =
      Number.isFinite(parsedMaxAge) && parsedMaxAge > 0 ? parsedMaxAge : 86400;
    const encrypted = await encode({
      token: refreshed,
      secret,
      salt: cookieName,
      maxAge,
    });
    const options = {
      httpOnly: true,
      secure,
      sameSite: 'lax' as const,
      path: '/',
    };
    const oldNames = (request.headers.get('cookie') || '')
      .split(';')
      .map((item) => item.trim().split('=')[0])
      .filter(
        (name) =>
          name === cookieName ||
          (name.startsWith(`${cookieName}.`) &&
            /^\d+$/.test(name.slice(cookieName.length + 1))),
      );
    const setCookies = oldNames.map((name) =>
      serialize(name, '', { ...options, maxAge: 0 }),
    );
    const expires = new Date(Date.now() + maxAge * 1000);
    if (encrypted.length <= COOKIE_CHUNK_SIZE)
      setCookies.push(
        serialize(cookieName, encrypted, { ...options, expires }),
      );
    else
      for (
        let start = 0, index = 0;
        start < encrypted.length;
        start += COOKIE_CHUNK_SIZE, index++
      )
        setCookies.push(
          serialize(
            `${cookieName}.${index}`,
            encrypted.slice(start, start + COOKIE_CHUNK_SIZE),
            { ...options, expires },
          ),
        );
    return {
      accessToken: refreshed.error ? null : refreshed.accessToken || null,
      setCookies,
    };
  } catch {
    return empty;
  }
}
