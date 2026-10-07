import type { JWT } from 'next-auth/jwt';
import {
  microsoftTokenConfig,
  refreshMicrosoftSession,
  type MicrosoftTokenConfig,
} from './token-lifecycle';

const config: MicrosoftTokenConfig = {
  tokenUrl: 'https://login.example.test/token',
  clientId: 'client',
  clientSecret: 'secret-fixture',
  scope: 'openid offline_access api://example/access_as_user',
};
const expired = (): JWT => ({
  sub: 'employee',
  workspaceRole: 'employee',
  accessToken: 'expired',
  accessTokenExpires: Date.now() - 1000,
  refreshToken: 'refresh-fixture',
});
const success = () =>
  ({
    ok: true,
    json: async () => ({
      access_token: 'renewed',
      expires_in: 3600,
      refresh_token: 'rotated',
    }),
  }) as Response;
beforeEach(() => {
  global.fetch = jest.fn().mockResolvedValue(success());
});

it('reuses a valid token without a new sign-in or token request', async () => {
  const token = { ...expired(), accessTokenExpires: Date.now() + 120_000 };
  expect(await refreshMicrosoftSession(token, config)).toBe(token);
  expect(fetch).not.toHaveBeenCalled();
});
it('silently refreshes a token near expiry and keeps the user and role', async () => {
  const token = {
    ...expired(),
    accessTokenExpires: Date.now() + 30_000,
    error: 'RefreshAccessTokenError' as const,
  };
  const result = await refreshMicrosoftSession(token, config);
  expect(result).toMatchObject({
    sub: 'employee',
    workspaceRole: 'employee',
    accessToken: 'renewed',
    refreshToken: 'rotated',
  });
  expect(result.error).toBeUndefined();
  expect(result.accessTokenExpires).toBeGreaterThan(Date.now() + 3_500_000);
  const init = jest.mocked(fetch).mock.calls[0][1]!;
  expect((init.body as URLSearchParams).get('grant_type')).toBe(
    'refresh_token',
  );
  expect((init.body as URLSearchParams).get('scope')).toContain(
    'offline_access',
  );
});
it('retains the old refresh token if Microsoft does not rotate it', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValue({
      ok: true,
      json: async () => ({ access_token: 'new', expires_in: 3600 }),
    } as Response);
  expect((await refreshMicrosoftSession(expired(), config)).refreshToken).toBe(
    'refresh-fixture',
  );
});
it('never returns an expired bearer when renewal is unavailable', async () => {
  jest
    .mocked(fetch)
    .mockResolvedValue({
      ok: false,
      json: async () => ({ error: 'invalid_grant', secret: 'must-not-log' }),
    } as Response);
  const log = jest.spyOn(console, 'error').mockImplementation(() => {});
  const result = await refreshMicrosoftSession(expired(), config);
  expect(result.error).toBe('RefreshAccessTokenError');
  expect(result.accessToken).toBeUndefined();
  expect(log).not.toHaveBeenCalled();
  log.mockRestore();
});
it('requires reauthentication if an expired session has no refresh token', async () => {
  const result = await refreshMicrosoftSession(
    { ...expired(), refreshToken: undefined },
    config,
  );
  expect(result.accessToken).toBeUndefined();
  expect(result.error).toBe('RefreshAccessTokenError');
  expect(fetch).not.toHaveBeenCalled();
});
it.each([
  { expires_in: 3600 },
  { access_token: 'new', expires_in: -1 },
  { access_token: 'new', expires_in: '3600' },
])(
  'rejects malformed refresh responses without using the expired bearer',
  async (payload) => {
    jest
      .mocked(fetch)
      .mockResolvedValue({ ok: true, json: async () => payload } as Response);
    expect(
      (await refreshMicrosoftSession(expired(), config)).accessToken,
    ).toBeUndefined();
  },
);
it('deduplicates concurrent refresh without sharing identity claims between calls', async () => {
  let resolve!: (value: Response) => void;
  jest.mocked(fetch).mockReturnValue(
    new Promise<Response>((done) => {
      resolve = done;
    }),
  );
  const first = refreshMicrosoftSession(expired(), config);
  const second = refreshMicrosoftSession(
    { ...expired(), sub: 'other-claim', workspaceRole: 'admin' },
    config,
  );
  expect(fetch).toHaveBeenCalledTimes(1);
  resolve(success());
  const [a, b] = await Promise.all([first, second]);
  expect(a.sub).toBe('employee');
  expect(b).toMatchObject({
    sub: 'other-claim',
    workspaceRole: 'admin',
    accessToken: 'renewed',
  });
});
it('requests offline access without dropping the configured API scope', () => {
  const before = process.env.ENTRA_SCOPES;
  process.env.ENTRA_SCOPES = 'openid api://fixture/access_as_user';
  expect(microsoftTokenConfig().scope).toBe(
    'openid api://fixture/access_as_user offline_access',
  );
  if (before === undefined) delete process.env.ENTRA_SCOPES;
  else process.env.ENTRA_SCOPES = before;
});
