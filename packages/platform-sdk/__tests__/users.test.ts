import { UsersModule } from '../src/modules/users';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('UsersModule', () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it('HP000 lists current user tenant memberships through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ tenants: [] }),
    });

    const users = new UsersModule('/api/eai');
    await users.listTenants();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/tenants',
      undefined,
    );
  });

  it('HP000b resolves app session routing through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ status: 'resolved' }),
    });

    const users = new UsersModule('/api/eai');
    await users.resolveSession({ product: 'eai-app-template' });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/session/resolve',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ product: 'eai-app-template' }),
      },
    );
  });

  it('HP000c reads the current custom user profile through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ id: 'custom-user-1' }),
    });

    const users = new UsersModule('/api/eai');
    await users.getCustomUser();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/custom-user/me',
      undefined,
    );
  });

  it('HP001 self-provisions the current user through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const users = new UsersModule('/api/eai');
    await users.provisionMe('tenant-a');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/me/provision',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: 'tenant-a' }),
      },
    );
  });

  it('HP002 patches the current user profile through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 200 });

    const users = new UsersModule('/api/eai');
    await users.updateProfile({ displayName: 'Example User' });

    expect(mockFetch).toHaveBeenCalledWith('/api/eai/v4/identity/me/profile', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ displayName: 'Example User' }),
    });
  });

  it('HP003 deprovisions tenant membership through v4 identity', async () => {
    mockFetch.mockResolvedValueOnce({ ok: true, status: 204 });

    const users = new UsersModule('/api/eai');
    await users.deprovision('tenant/a');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/identity/tenants/tenant%2Fa/membership',
      { method: 'DELETE' },
    );
  });
});
