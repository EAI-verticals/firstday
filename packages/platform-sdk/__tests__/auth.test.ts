import { AuthModule } from '../src/modules/auth';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AuthModule', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('HP001 gets the current user from the v4 identity endpoint', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: () => Promise.resolve({ oid: 'user-1', tid: 'tenant-1' }),
    });

    const auth = new AuthModule('/api/eai');
    await auth.me();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/me',
      undefined,
    );
  });
});
