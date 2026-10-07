/** @jest-environment node */
import { encode, getToken } from 'next-auth/jwt';
import { refreshMicrosoftSession } from './token-lifecycle';
import { getServerAccessToken } from './server-access-token';

jest.mock('next-auth/jwt', () => ({ encode: jest.fn(), getToken: jest.fn() }));
jest.mock('./token-lifecycle', () => ({ refreshMicrosoftSession: jest.fn() }));
const originalEnv = process.env;
const token = {
  sub: 'employee',
  accessToken: 'old',
  accessTokenExpires: 0,
  refreshToken: 'fixture',
};
beforeEach(() => {
  jest.clearAllMocks();
  process.env = {
    ...originalEnv,
    AUTH_SECRET: 'test-secret',
    AUTH_URL: 'http://localhost:3001/app/api/auth',
  };
  jest.mocked(getToken).mockResolvedValue(token);
  jest
    .mocked(refreshMicrosoftSession)
    .mockResolvedValue({
      ...token,
      accessToken: 'new',
      accessTokenExpires: Date.now() + 3600000,
    });
  jest.mocked(encode).mockResolvedValue('encrypted-fixture');
});
afterEach(() => {
  process.env = originalEnv;
});
const request = (cookie = 'authjs.session-token=old') =>
  new Request('http://localhost:3001/app/api/eai/v4/ai/chat', {
    headers: { cookie },
  });
it('renews the shared encrypted HttpOnly cookie and returns only the server bearer', async () => {
  const result = await getServerAccessToken(request());
  expect(result.accessToken).toBe('new');
  expect(
    result.setCookies.some(
      (value) =>
        value.includes('encrypted-fixture') &&
        value.includes('HttpOnly') &&
        value.includes('SameSite=Lax'),
    ),
  ).toBe(true);
  expect(result.setCookies.join(';')).not.toContain('accessToken');
  expect(encode).toHaveBeenCalledWith(
    expect.objectContaining({
      salt: 'authjs.session-token',
      maxAge: expect.any(Number),
      token: expect.objectContaining({ accessToken: 'new' }),
    }),
  );
});
it('reuses a valid token without rewriting the session', async () => {
  jest.mocked(refreshMicrosoftSession).mockResolvedValue(token);
  expect(await getServerAccessToken(request())).toEqual({
    accessToken: 'old',
    setCookies: [],
  });
  expect(encode).not.toHaveBeenCalled();
});
it('removes stale cookie chunks and chunks renewed large sessions', async () => {
  jest.mocked(encode).mockResolvedValue('a'.repeat(4500));
  const result = await getServerAccessToken(
    request(
      'authjs.session-token.0=old; authjs.session-token.1=old; unrelated=keep',
    ),
  );
  expect(
    result.setCookies.filter((value) => value.includes('Max-Age=0')),
  ).toHaveLength(2);
  expect(
    result.setCookies.filter((value) => value.includes('Expires=')),
  ).toHaveLength(2);
  expect(result.setCookies.join(';')).not.toContain('unrelated');
});
it('uses secure cookie names and flags on HTTPS', async () => {
  process.env.AUTH_URL = 'https://app.example.test/app/api/auth';
  const result = await getServerAccessToken(
    request('__Secure-authjs.session-token=old'),
  );
  expect(getToken).toHaveBeenCalledWith(
    expect.objectContaining({
      secureCookie: true,
      cookieName: '__Secure-authjs.session-token',
    }),
  );
  expect(result.setCookies.every((value) => value.includes('Secure'))).toBe(
    true,
  );
});
it('persists refresh failure without forwarding the expired bearer', async () => {
  jest
    .mocked(refreshMicrosoftSession)
    .mockResolvedValue({
      ...token,
      error: 'RefreshAccessTokenError',
      accessToken: undefined,
    });
  const result = await getServerAccessToken(request());
  expect(result.accessToken).toBeNull();
  expect(result.setCookies.length).toBeGreaterThan(0);
});
it('rejects anonymous, corrupted and unidentified sessions', async () => {
  jest
    .mocked(getToken)
    .mockResolvedValueOnce(null)
    .mockRejectedValueOnce(new Error('bad cookie'))
    .mockResolvedValueOnce({ accessToken: 'no-sub' });
  for (let i = 0; i < 3; i++)
    expect(await getServerAccessToken(request())).toEqual({
      accessToken: null,
      setCookies: [],
    });
  expect(refreshMicrosoftSession).not.toHaveBeenCalled();
});
