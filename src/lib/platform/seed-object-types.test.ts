import {
  objectTypePayload,
  seedObjectTypes,
} from '@/lib/platform/seed-object-types';
import { objectTypes } from '@/eai.config/object-types';
import { createResourceRouting } from '@enterpriseaigroup/platform-sdk';

const mockFetch = jest.fn();
global.fetch = mockFetch;

const originalEnv = process.env;
const TEST_TENANT_KEY = Object.keys(objectTypes)[0] ?? 'template';

describe('seedObjectTypes', () => {
  beforeEach(() => {
    process.env = {
      ...originalEnv,
      NEXT_PUBLIC_APP_BASE_PATH: '/my-template/',
    };
    mockFetch.mockReset();
    mockFetch.mockImplementation((url: string) => {
      if (url.includes('?')) {
        return Promise.resolve({
          ok: true,
          json: () => Promise.resolve({ docs: [] }),
        });
      }
      return Promise.resolve({
        ok: true,
        json: () => Promise.resolve({ id: 'created' }),
      });
    });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('HP001 seeds object types through basePath-aware PublicAPI v4 URLs', async () => {
    const results = await seedObjectTypes(TEST_TENANT_KEY, 'tenant-a');
    const objectTypesUrl = createResourceRouting({
      baseUrl: '/my-template/api/eai',
      tenantId: 'tenant-a',
    }).objectTypes();

    expect(results.every((result) => result.status === 'created')).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      expect.stringMatching(new RegExp(`^${objectTypesUrl}\\?`)),
      undefined,
    );
    expect(mockFetch).toHaveBeenCalledWith(
      objectTypesUrl,
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('BP001 reports an unknown tenant key without calling PublicAPI', async () => {
    const results = await seedObjectTypes('unknown', 'tenant-a');

    expect(results).toEqual([
      {
        name: 'unknown',
        status: 'failed',
        message: 'No object types found for key "unknown"',
      },
    ]);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it.each(['owner_private', 'shared_private'] as const)(
    'preserves %s ResourceAPI authorization on the wire',
    (privacyClass) => {
      const payload = objectTypePayload({
        name: 'RatesReviewSubmission',
        slug: 'rates-review-submission',
        displayName: 'Rates Review Submission',
        authorization: { privacyClass },
        properties: [],
        linkTypes: [],
        actions: [],
        storageBackend: 'postgresql',
        status: 'published',
      });

      expect(JSON.parse(JSON.stringify(payload))).toMatchObject({
        authorization: { privacyClass },
      });
    },
  );

  it('omits authorization on the wire when the type has no policy', () => {
    const payload = objectTypePayload({
      name: 'LegacySubmission',
      slug: 'legacy-submission',
      displayName: 'Legacy Submission',
      properties: [],
      linkTypes: [],
      actions: [],
      storageBackend: 'postgresql',
      status: 'published',
    });

    expect(JSON.parse(JSON.stringify(payload))).not.toHaveProperty(
      'authorization',
    );
  });
});
