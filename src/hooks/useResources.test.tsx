import { renderHook } from '@testing-library/react';
import { createResourceRouting } from '@enterpriseaigroup/platform-sdk';

import { useResources } from './useResources';

const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('useResources', () => {
  const originalTenantId = process.env.NEXT_PUBLIC_EAI_TENANT_ID;

  beforeEach(() => {
    mockFetch.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      status: 200,
      json: () => Promise.resolve({ docs: [] }),
    });
  });

  afterEach(() => {
    if (originalTenantId === undefined) {
      delete process.env.NEXT_PUBLIC_EAI_TENANT_ID;
    } else {
      process.env.NEXT_PUBLIC_EAI_TENANT_ID = originalTenantId;
    }
  });

  it('uses NEXT_PUBLIC_EAI_TENANT_ID when no tenant override is passed', async () => {
    process.env.NEXT_PUBLIC_EAI_TENANT_ID = 'env-tenant';

    const { result } = renderHook(() => useResources('Project'));
    await result.current.list({ limit: 1 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${createResourceRouting({ baseUrl: '/api/eai', tenantId: 'env-tenant' }).collection('Project')}?limit=1`,
      undefined,
    );
  });

  it('prefers an explicit tenant override over NEXT_PUBLIC_EAI_TENANT_ID', async () => {
    process.env.NEXT_PUBLIC_EAI_TENANT_ID = 'env-tenant';

    const { result } = renderHook(() =>
      useResources('Project', 'explicit-tenant'),
    );
    await result.current.list({ limit: 1 });

    expect(mockFetch).toHaveBeenCalledWith(
      `${createResourceRouting({ baseUrl: '/api/eai', tenantId: 'explicit-tenant' }).collection('Project')}?limit=1`,
      undefined,
    );
  });

  it('defaults search to the current object type slug', async () => {
    process.env.NEXT_PUBLIC_EAI_TENANT_ID = 'env-tenant';

    const { result } = renderHook(() => useResources('Project'));
    await result.current.search({ query: 'smoke', limit: 1 });

    expect(mockFetch).toHaveBeenCalledWith(
      createResourceRouting({
        baseUrl: '/api/eai',
        tenantId: 'env-tenant',
      }).search(),
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          query: 'smoke',
          limit: 1,
          objectTypes: ['project'],
        }),
      },
    );
  });
});
