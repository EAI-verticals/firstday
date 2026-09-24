import {
  buildPublicApiUrl,
  normalizePublicApiBaseUrl,
} from '@/lib/platform/publicapi-url';
import { createResourceRouting } from '@enterpriseaigroup/platform-sdk';

describe('publicApi URL helper', () => {
  it('HP001 strips v4 suffixes before appending v4 paths', () => {
    expect(normalizePublicApiBaseUrl('/my-template/api/eai/v4/')).toBe(
      '/my-template/api/eai',
    );
  });

  it('HP002 preserves relative app base paths when building URLs', () => {
    const objectTypesPath = createResourceRouting({
      baseUrl: '',
      tenantId: 'unused',
    }).objectTypes();
    expect(
      buildPublicApiUrl('/my-template/api/eai/v4', objectTypesPath, {
        limit: 1,
      }),
    ).toBe(`/my-template/api/eai${objectTypesPath}?limit=1`);
  });

  it('HP003 preserves absolute PublicAPI origins when building URLs', () => {
    expect(
      buildPublicApiUrl('https://api.example.com/public/', 'v4/identity/me'),
    ).toBe('https://api.example.com/public/v4/identity/me');
  });
});
