import type {
  ObjectTypeDefinition,
  StorageBackend,
} from '@/eai.config/object-types';

const BACKEND_ORDER: StorageBackend[] = [
  'postgresql',
  'documentdb',
  'blob',
  'search',
];

export interface StorageProvisionTargets {
  postgresql: boolean;
  documentdb: boolean;
  blob: boolean;
  search: boolean;
}

export interface TenantStorageProvisioningSummary {
  tenantKey: string;
  declaredBackends: StorageBackend[];
  objectTypesByBackend: Record<StorageBackend, string[]>;
  provision: StorageProvisionTargets;
  notes: string[];
}

function emptyObjectTypesByBackend(): Record<StorageBackend, string[]> {
  return {
    postgresql: [],
    documentdb: [],
    blob: [],
    search: [],
  };
}

export function summarizeTenantStorageProvisioning(
  tenantKey: string,
  types: ObjectTypeDefinition[],
): TenantStorageProvisioningSummary {
  const objectTypesByBackend = emptyObjectTypesByBackend();

  for (const type of types) {
    objectTypesByBackend[type.storageBackend].push(type.name);
  }

  const declaredBackends = BACKEND_ORDER.filter(
    (backend) => objectTypesByBackend[backend].length > 0,
  );

  const requiresPostgresql = declaredBackends.some(
    (backend) =>
      backend === 'postgresql' ||
      backend === 'documentdb' ||
      backend === 'blob',
  );

  const summary: TenantStorageProvisioningSummary = {
    tenantKey,
    declaredBackends,
    objectTypesByBackend,
    provision: {
      postgresql: requiresPostgresql,
      documentdb: objectTypesByBackend.documentdb.length > 0,
      blob: objectTypesByBackend.blob.length > 0,
      search: objectTypesByBackend.search.length > 0,
    },
    notes: [],
  };

  if (summary.provision.documentdb) {
    summary.notes.push(
      'DocumentDB object types require a dedicated ResourceAPI DocumentDB plus PostgreSQL shadow records for links, history, and query parity.',
    );
  }

  if (summary.provision.blob) {
    summary.notes.push(
      'Blob object types require Blob Storage plus PostgreSQL shadow records for metadata, links, history, and aggregate/list behavior.',
    );
  }

  if (summary.provision.search) {
    summary.notes.push(
      'Search is a derived projection backend, not the primary system of record. Provision AI Search intentionally and pair it with a canonical write store.',
    );
  }

  if (
    summary.provision.search &&
    !summary.provision.postgresql &&
    !summary.provision.documentdb &&
    !summary.provision.blob
  ) {
    summary.notes.push(
      'Search-only object type sets are not sufficient for canonical runtime data. Add a canonical backend before relying on runtime writes.',
    );
  }

  return summary;
}

export function summarizeStorageProvisioning(
  tenantObjectTypes: Record<string, ObjectTypeDefinition[]>,
): TenantStorageProvisioningSummary[] {
  return Object.entries(tenantObjectTypes).map(([tenantKey, types]) =>
    summarizeTenantStorageProvisioning(tenantKey, types),
  );
}
