import {
  EAIPlatformClient,
  toObjectTypeSlug,
} from '@enterpriseaigroup/platform-sdk';

export interface PlatformStatus {
  objectTypes: boolean;
  dataResources: boolean;
  crud: boolean;
  aggregate: boolean;
  cursor: boolean;
  identifierConsistency: boolean;
}

/**
 * Verifies platform connectivity by checking:
 * 1. Object Type metadata is reachable
 * 2. Data resource schema is reachable
 * 3. CRUD works for at least one object type
 *
 * @param tenantId - Tenant ID (from TENANT_*_ID env var)
 */
export async function verifyPlatform(
  tenantId: string,
): Promise<PlatformStatus> {
  const client = new EAIPlatformClient({ tenantId });
  const status: PlatformStatus = {
    objectTypes: false,
    dataResources: false,
    crud: false,
    aggregate: false,
    cursor: false,
    identifierConsistency: false,
  };

  // Check 1: Object Type metadata is reachable
  try {
    const response = await client.resources.listObjectTypes({ limit: 1 });
    status.objectTypes = Array.isArray(response.docs);
  } catch {
    status.objectTypes = false;
  }

  // Check 2: data resource schema is reachable
  try {
    const schema = await client.resources.getSchema();
    status.dataResources =
      Array.isArray((schema as { objectTypes?: unknown[] }).objectTypes) ||
      Array.isArray((schema as { object_types?: unknown[] }).object_types);
  } catch {
    status.dataResources = false;
  }

  // Check 3: list/aggregate/cursor work for at least one published type
  try {
    const schema = (await client.resources.getSchema()) as {
      objectTypes?: Array<{ name?: string; slug?: string }>;
      object_types?: Array<{ name?: string; slug?: string }>;
    };
    const firstType = schema.objectTypes?.[0] || schema.object_types?.[0];
    const schemaTypes = schema.objectTypes || schema.object_types || [];
    status.identifierConsistency =
      schemaTypes.length > 0 &&
      schemaTypes.every((type) => {
        if (typeof type?.name !== 'string' || !type.name.trim()) {
          return false;
        }
        if (typeof type?.slug !== 'string' || !type.slug.trim()) {
          return true;
        }
        return type.slug === toObjectTypeSlug(type.name);
      });

    // A persisted legacy pair may not derive under v1. Report that fact, but
    // preserve read-only verification by using its stored slug exactly; never
    // retry with a name, alias, redirect, or registry lookup.
    const firstSlug =
      typeof firstType?.slug === 'string' && firstType.slug.trim()
        ? firstType.slug
        : undefined;
    if (firstSlug) {
      const listResponse = await client.resources.list(firstSlug, { limit: 1 });
      status.crud = Array.isArray(listResponse.docs);

      const aggregateResponse = await client.resources.aggregate(firstSlug, {
        groupBy: ['id'],
        metrics: { count: { function: 'count' } },
        limit: 1,
      });
      status.aggregate = Array.isArray(aggregateResponse.rows);

      status.cursor =
        listResponse.nextCursor === null ||
        typeof listResponse.nextCursor === 'string' ||
        listResponse.nextCursor === undefined;
    }
  } catch {
    status.crud = false;
    status.aggregate = false;
    status.cursor = false;
    status.identifierConsistency = false;
  }

  return status;
}
