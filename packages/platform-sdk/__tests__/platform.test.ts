import { PlatformModule } from '../src/modules/platform';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('PlatformModule', () => {
  let platform: PlatformModule;

  beforeEach(() => {
    platform = new PlatformModule('/api/eai');
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ ok: true }),
    });
  });

  it('sends generic requests through the v4 platform BFF route', async () => {
    await platform.request('/tenants/tenant-a/dashboard', {
      params: { include_descendants: true },
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant-a/dashboard?include_descendants=true',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('lists the capability catalog through the AdminAPI platform proxy', async () => {
    await platform.listCapabilityCatalog();

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/capabilities/catalog',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('reads tenant usage through the live billing usage route', async () => {
    await platform.getTenantUsage('tenant-a', 'month');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant-a/billing/usage?timeframe=month',
      expect.objectContaining({ method: 'GET' }),
    );
  });

  it('creates tenant apps through the v4 platform app route', async () => {
    await platform.createTenantApp('tenant-a', {
      appDisplayName: 'Permit App',
      verticalKey: 'permit-app',
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant-a/apps',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appDisplayName: 'Permit App',
          verticalKey: 'permit-app',
        }),
      },
    );
  });

  it('saves app object type manifests through the v4 platform route', async () => {
    await platform.saveAppObjectTypesManifest('tenant/a', 'permit/app', {
      objectTypes: [{ name: 'Application' }],
    });

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant%2Fa/apps/permit%2Fapp/object-types/manifest',
      {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          objectTypes: [{ name: 'Application' }],
        }),
      },
    );
  });

  it('looks up platform users through tenant-scoped v4 routes', async () => {
    await platform.getUserByEmail('tenant/a', 'jane@example.com');
    await platform.getUserMemberships('tenant/a', 'user/oid');

    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant%2Fa/users/by-email?email=jane%40example.com',
      expect.objectContaining({ method: 'GET' }),
    );
    expect(mockFetch).toHaveBeenCalledWith(
      '/api/eai/v4/platform/tenants/tenant%2Fa/users/user%2Foid/memberships',
      expect.objectContaining({ method: 'GET' }),
    );
  });
});
