import { EAIPlatformClient } from '../src/client';

describe('orchestrate module retirement', () => {
  it('BP001 does not expose legacy generic v3 orchestrate proxies', () => {
    const client = new EAIPlatformClient({ tenantId: 'test-tenant' });

    expect('orchestrate' in client).toBe(false);
    expect('legacyOrchestrate' in client).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(client, 'orchestrate')).toBe(
      false,
    );
    expect(
      Object.prototype.hasOwnProperty.call(client, 'legacyOrchestrate'),
    ).toBe(false);
  });
});
