import NextAuth, { type NextAuthConfig } from 'next-auth';
import { refreshMicrosoftSession } from '@/lib/auth/token-lifecycle';
jest.mock('next-auth', () => ({
  __esModule: true,
  default: jest.fn(() => ({
    handlers: {},
    auth: jest.fn(),
    signIn: jest.fn(),
    signOut: jest.fn(),
  })),
}));
jest.mock('next-auth/providers/microsoft-entra-id', () => ({
  __esModule: true,
  default: (options: unknown) => options,
}));
jest.mock('@/lib/auth/token-lifecycle', () => ({
  microsoftTokenConfig: () => ({
    scope: 'openid offline_access api://fixture/access_as_user',
  }),
  refreshMicrosoftSession: jest.fn(),
}));
import './auth';
const mockConfig = jest.mocked(NextAuth).mock.calls[0][0] as NextAuthConfig;

it('keeps bearer and refresh credentials out of client-visible session JSON', async () => {
  const result = await mockConfig.callbacks!.session!({
    session: { user: {}, expires: 'future' },
    token: {
      sub: 'employee',
      name: 'Alex',
      workspaceRole: 'employee',
      accessToken: 'private-bearer',
      refreshToken: 'private-refresh',
    },
  } as never);
  expect(result.user).toMatchObject({
    id: 'employee',
    name: 'Alex',
    workspaceRole: 'employee',
  });
  expect(JSON.stringify(result)).not.toMatch(
    /private-bearer|private-refresh|accessToken|refreshToken/,
  );
});
it('clears a former session error after successful token renewal', async () => {
  const result = await mockConfig.callbacks!.session!({
    session: { user: {}, expires: 'future', error: 'RefreshAccessTokenError' },
    token: { sub: 'employee' },
  } as never);
  expect(result).not.toHaveProperty('error', 'RefreshAccessTokenError');
});
it('initial Microsoft sign-in derives privileges from trusted profile roles', async () => {
  const token = await mockConfig.callbacks!.jwt!({
    token: { sub: 'employee' },
    account: {
      access_token: 'private-bearer',
      refresh_token: 'private-refresh',
      expires_at: 1000,
    },
    user: { name: 'Alex' },
    profile: { roles: ['Firstday.Admin'] },
  } as never);
  expect(token).toMatchObject({
    workspaceRole: 'admin',
    accessToken: 'private-bearer',
    accessTokenExpires: 1000000,
  });
});
it('subsequent session checks use the same refresh path as the proxy', async () => {
  const token = { sub: 'employee', accessToken: 'old' };
  jest
    .mocked(refreshMicrosoftSession)
    .mockResolvedValueOnce({ ...token, accessToken: 'new' });
  expect(await mockConfig.callbacks!.jwt!({ token } as never)).toMatchObject({
    accessToken: 'new',
  });
  expect(refreshMicrosoftSession).toHaveBeenCalledWith(token);
});
it('does not promote a retired Employer claim to Admin', async () => {
  const token = await mockConfig.callbacks!.jwt!({
    token: { sub: 'former-employer' },
    account: { access_token: 'fixture', expires_at: 1000 },
    user: { name: 'Sample' },
    profile: { roles: ['Firstday.Employer'] },
  } as never);
  expect(token?.workspaceRole).toBe('employee');
});
it('does not expose a cached retired Employer role as Admin', async () => {
  const result = await mockConfig.callbacks!.session!({
    session: { user: {}, expires: 'future' },
    token: { sub: 'former-employer', workspaceRole: 'employer' },
  } as never);
  expect(result).toMatchObject({ user: { workspaceRole: 'employee' } });
});
describe('Microsoft callback destination', () => {
  const before = process.env.APP_BASE_PATH;
  beforeEach(() => {
    process.env.APP_BASE_PATH = '/firstday';
  });
  afterAll(() => {
    if (before === undefined) delete process.env.APP_BASE_PATH;
    else process.env.APP_BASE_PATH = before;
  });
  it.each([
    [
      '/firstday?previewRole=employee',
      'https://app.test/firstday?previewRole=employee',
    ],
    ['/auth/error', 'https://app.test/firstday/auth/error'],
    [
      'https://app.test/firstday?role=employee',
      'https://app.test/firstday?role=employee',
    ],
    ['https://other.test', 'https://app.test/firstday'],
    ['//other.test', 'https://app.test/firstday'],
  ])('keeps callback %s on the correct app path', async (url, expected) => {
    expect(
      await mockConfig.callbacks!.redirect!({
        url,
        baseUrl: 'https://app.test',
      }),
    ).toBe(expected);
  });
});
