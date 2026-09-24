const mockListObjectTypes = jest.fn();
const mockGetSchema = jest.fn();
const mockList = jest.fn();
const mockAggregate = jest.fn();

jest.mock('@enterpriseaigroup/platform-sdk', () => ({
  EAIPlatformClient: jest.fn().mockImplementation(() => ({
    resources: {
      listObjectTypes: mockListObjectTypes,
      getSchema: mockGetSchema,
      list: mockList,
      aggregate: mockAggregate,
    },
  })),
  toObjectTypeSlug: (objectType: string) =>
    objectType
      .trim()
      .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
      .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
      .replace(/[_\s]+/g, '-')
      .replace(/-+/g, '-')
      .toLowerCase(),
}));

import { verifyPlatform } from './verify-platform';

describe('verifyPlatform', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('checks identifier consistency and probes CRUD using only the object type slug', async () => {
    mockListObjectTypes.mockResolvedValue({ docs: [{ id: 'type-1' }] });
    mockGetSchema.mockResolvedValue({
      objectTypes: [{ name: 'WatchTarget', slug: 'watch-target' }],
    });
    mockList.mockResolvedValue({ docs: [], nextCursor: null });
    mockAggregate.mockResolvedValue({ rows: [] });

    const result = await verifyPlatform('tenant-a');

    expect(result).toMatchObject({
      objectTypes: true,
      dataResources: true,
      crud: true,
      aggregate: true,
      cursor: true,
      identifierConsistency: true,
    });
    expect(mockList).toHaveBeenCalledWith('watch-target', { limit: 1 });
    expect(mockAggregate).toHaveBeenCalledWith('watch-target', {
      groupBy: ['id'],
      metrics: { count: { function: 'count' } },
      limit: 1,
    });
  });

  it('flags schema identifier mismatches when slug and name diverge', async () => {
    mockListObjectTypes.mockResolvedValue({ docs: [{ id: 'type-1' }] });
    mockGetSchema.mockResolvedValue({
      objectTypes: [{ name: 'WatchTarget', slug: 'watchtarget' }],
    });
    mockList.mockResolvedValue({ docs: [], nextCursor: undefined });
    mockAggregate.mockResolvedValue({ rows: [] });

    const result = await verifyPlatform('tenant-a');

    expect(result.identifierConsistency).toBe(false);
  });

  it('reports legacy derivation drift without falling back to a name lookup', async () => {
    mockListObjectTypes.mockResolvedValue({ docs: [{ id: 'type-1' }] });
    mockGetSchema.mockResolvedValue({
      objectTypes: [{ name: 'GitHubConnection', slug: 'github-connection' }],
    });
    mockList.mockResolvedValue({ docs: [], nextCursor: null });
    mockAggregate.mockResolvedValue({ rows: [] });

    const result = await verifyPlatform('tenant-a');

    expect(result.identifierConsistency).toBe(false);
    expect(mockList).toHaveBeenCalledWith('github-connection', { limit: 1 });
    expect(mockAggregate).toHaveBeenCalledWith(
      'github-connection',
      expect.any(Object),
    );
  });
});
