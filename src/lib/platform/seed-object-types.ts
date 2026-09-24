import { objectTypes } from '@/eai.config/object-types';
import { EAIPlatformClient, PlatformError } from '@enterpriseaigroup/platform-sdk';

export interface SeedResult {
  name: string;
  status: 'created' | 'updated' | 'skipped' | 'failed';
  message?: string;
}

export function objectTypePayload(
  type: (typeof objectTypes)[keyof typeof objectTypes][number],
  tenantId?: string,
) {
  return {
    name: type.name,
    displayName: type.displayName,
    description: type.description,
    authorization: type.authorization,
    properties: type.properties,
    linkTypes: type.linkTypes,
    actions: type.actions,
    storageBackend: type.storageBackend,
    status: type.status,
    ...(tenantId ? { tenant: tenantId } : {}),
  };
}

function failureMessage(prefix: string, error: unknown): string {
  if (error instanceof PlatformError) {
    return `${prefix}: ${error.status}`;
  }
  return error instanceof Error ? error.message : 'Unknown error';
}

/**
 * Seeds object types from eai.config through the v4 platform API.
 *
 * Idempotent: checks if each type exists before creating.
 *
 * @param tenantKey - Key in objectTypes map (e.g., 'template')
 * @param tenantId - Tenant record ID (from TENANT_*_ID env var)
 */
export async function seedObjectTypes(
  tenantKey: string,
  tenantId: string,
): Promise<SeedResult[]> {
  const client = new EAIPlatformClient({ tenantId });
  const types = objectTypes[tenantKey as keyof typeof objectTypes];

  if (!types || types.length === 0) {
    return [
      {
        name: tenantKey,
        status: 'failed',
        message: `No object types found for key "${tenantKey}"`,
      },
    ];
  }

  const results: SeedResult[] = [];

  for (const type of types) {
    try {
      const checkData = await client.resources.listObjectTypes<{
        id?: string;
      }>({
          where: { name: { equals: type.name }, tenant: { equals: tenantId } },
      });
      const existing = checkData?.docs?.[0];

      if (existing) {
        if (!existing.id) {
          results.push({
            name: type.name,
            status: 'failed',
            message: 'Existing object type is missing id',
          });
          continue;
        }

        await client.resources.updateObjectType(
          existing.id,
          objectTypePayload(type),
        );
        results.push({ name: type.name, status: 'updated' });
      } else {
        await client.resources.createObjectType(
          objectTypePayload(type, tenantId),
        );
        results.push({ name: type.name, status: 'created' });
      }
    } catch (error) {
      results.push({
        name: type.name,
        status: 'failed',
        message: failureMessage('Object type seed failed', error),
      });
    }
  }

  return results;
}
