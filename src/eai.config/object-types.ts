/**
 * Object Type definitions for Vending Machine App
 *
 * Each object type maps to a platform resource with typed validation, actions, and relationship links.
 *
 * Commands:
 *   eai types validate --tenant-key vending-machine-app --tenant-id <tenant-id>
 *   eai types seed --tenant-key vending-machine-app --tenant-id <tenant-id>
 *   eai types diff --tenant-key vending-machine-app --tenant-id <tenant-id>
 *
 * ┌──────────────────────────────────────────────────────────────┐
 * │ Field Types                                                  │
 * ├────────────┬─────────────────────────────────────────────────┤
 * │ text       │ String value (names, emails, IDs)               │
 * │ number     │ Integer or float (counts, amounts, scores)      │
 * │ boolean    │ True/false flag (isVerified, isActive)           │
 * │ date       │ ISO 8601 datetime (submittedAt, createdAt)      │
 * │ select     │ Enum — requires `options` array                 │
 * │ json       │ Arbitrary JSON object (metadata, config)        │
 * │ file       │ File reference URL (attachments, uploads)       │
 * │ relationship│ Reference to another resource by ID            │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ Link Types (cardinality)                                     │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ one-to-one │ Single reference (e.g., profile → user)         │
 * │ one-to-many│ Parent → children (e.g., order → items)         │
 * │ many-to-one│ Child → parent (e.g., item → order)             │
 * │ many-to-many│ Bidirectional (e.g., tags ↔ articles)          │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ Action Side Effects                                          │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ set_field  │ Set a property to a specific value               │
 * │ set_timestamp │ Set a date field to current time              │
 * │ set_user   │ Set a field to the current user's ID             │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ Roles                                                        │
 * ├────────────┼─────────────────────────────────────────────────┤
 * │ tenant-viewer│ Basic access (read and lightweight submit)     │
 * │ tenant-builder│ Extended access (view all, edit, actions)     │
 * │ tenant-admin│ Full access (delete, configure)                │
 * └────────────┴─────────────────────────────────────────────────┘
 */

export type FieldType =
  | 'text'
  | 'number'
  | 'boolean'
  | 'date'
  | 'select'
  | 'json'
  | 'file'
  | 'relationship';

export interface SelectOption {
  label: string;
  value: string;
}

export interface PropertyDefinition {
  name: string;
  type: FieldType;
  required: boolean;
  indexed?: boolean;
  defaultValue?: string | number | boolean;
  options?: SelectOption[];
  description?: string;
}

export type Cardinality =
  | 'one-to-one'
  | 'one-to-many'
  | 'many-to-one'
  | 'many-to-many';

export interface LinkTypeDefinition {
  name: string;
  /** Exact stored Object Type slug used on relationship routes. */
  targetObjectType: string;
  cardinality: Cardinality;
  cascadeDelete?: boolean;
}

export type SideEffectType = 'set_field' | 'set_timestamp' | 'set_user';

export interface ActionSideEffect {
  type: SideEffectType;
  field: string;
  value?: string | number | boolean;
}

export interface ActionValidationRules {
  requiredFields?: string[];
  requiredStatus?: string | string[];
}

export interface ActionDefinition {
  name: string;
  displayName: string;
  requiredRole: 'tenant-viewer' | 'tenant-builder' | 'tenant-admin';
  validationRules: ActionValidationRules;
  sideEffects: ActionSideEffect[];
}

export type StorageBackend = 'postgresql' | 'documentdb' | 'blob' | 'search';

export type ObjectTypeStatus = 'draft' | 'published' | 'deprecated';

export interface ObjectTypeDefinition {
  name: string;
  slug: string;
  displayName: string;
  description?: string;
  authorization?: { privacyClass: 'owner_private' | 'shared_private' };
  properties: PropertyDefinition[];
  linkTypes: LinkTypeDefinition[];
  actions: ActionDefinition[];
  storageBackend: StorageBackend;
  schemaVersion?: number;
  storageMetadataStatus?: 'draft' | 'ready';
  storageBinding?: {
    blob?: {
      storageAccountAlias: 'tenant-blob';
      containerName: string;
    };
    sql?: {
      databaseAlias: 'tenant-postgres';
      tenantSchemaStrategy: 'per-tenant-schema';
      tableName: string;
    };
  };
  status: ObjectTypeStatus;
}

const postgresqlResourceStorage = {
  schemaVersion: 1,
  storageBackend: 'postgresql' as const,
  storageMetadataStatus: 'ready' as const,
  storageBinding: {
    sql: {
      databaseAlias: 'tenant-postgres' as const,
      tenantSchemaStrategy: 'per-tenant-schema' as const,
      tableName: 'd3ad7caa7d71_vending_machine_app_tenant_resources',
    },
  },
};

export const objectTypes: Record<string, ObjectTypeDefinition[]> = {
  'vending-machine-app': [
    {
      name: 'OnboardingDocument',
      slug: 'onboarding-document',
      displayName: 'Onboarding document',
      description:
        'Employee-owned identity file and extracted fields for review.',
      authorization: { privacyClass: 'owner_private' },
      storageBackend: 'blob',
      schemaVersion: 1,
      storageMetadataStatus: 'ready',
      storageBinding: {
        blob: {
          storageAccountAlias: 'tenant-blob',
          containerName: 'd3ad7caa7d71-vending-machine-app-documents',
        },
      },
      properties: [
        { name: 'filename', type: 'text', required: true },
        { name: 'documentTypeKey', type: 'text', required: true },
        { name: 'file', type: 'file', required: false },
        { name: 'status', type: 'text', required: true },
        { name: 'extractedFields', type: 'json', required: false },
        { name: 'analysedAt', type: 'date', required: false },
      ],
      linkTypes: [],
      actions: [],
      status: 'published',
    },
    {
      name: 'Record',
      slug: 'record',
      displayName: 'Record',
      description: 'A sample record — replace with your domain model',
      ...postgresqlResourceStorage,
      properties: [
        {
          name: 'title',
          type: 'text' as const,
          required: true,
          indexed: true,
          description: 'Title of this record',
        },
        {
          name: 'description',
          type: 'text' as const,
          required: false,
          description: 'Detailed description',
        },
        {
          name: 'priority',
          type: 'number' as const,
          required: false,
          defaultValue: 0,
          description: 'Priority level (0 = normal)',
        },
        {
          name: 'isActive',
          type: 'boolean' as const,
          required: true,
          defaultValue: true,
          description: 'Whether this record is active',
        },
        {
          name: 'dueDate',
          type: 'date' as const,
          required: false,
          description: 'Target completion date',
        },
        {
          name: 'status',
          type: 'select' as const,
          required: true,
          defaultValue: 'draft',
          options: [
            { label: 'Draft', value: 'draft' },
            { label: 'In Progress', value: 'in-progress' },
            { label: 'Complete', value: 'complete' },
            { label: 'Archived', value: 'archived' },
          ],
          description: 'Current lifecycle status',
        },
        {
          name: 'metadata',
          type: 'json' as const,
          required: false,
          description: 'Arbitrary metadata (tags, notes, etc.)',
        },
        {
          name: 'assignedTo',
          type: 'relationship' as const,
          required: false,
          indexed: true,
          description: 'User ID of the assignee',
        },
      ],
      linkTypes: [],
      actions: [
        {
          name: 'submit',
          displayName: 'Submit',
          requiredRole: 'tenant-viewer' as const,
          validationRules: {
            requiredFields: ['title'],
            requiredStatus: 'draft',
          },
          sideEffects: [
            {
              type: 'set_field' as const,
              field: 'status',
              value: 'in-progress',
            },
            { type: 'set_timestamp' as const, field: 'dueDate' },
            { type: 'set_user' as const, field: 'assignedTo' },
          ],
        },
        {
          name: 'complete',
          displayName: 'Mark Complete',
          requiredRole: 'tenant-builder' as const,
          validationRules: {
            requiredStatus: 'in-progress',
          },
          sideEffects: [
            { type: 'set_field' as const, field: 'status', value: 'complete' },
            { type: 'set_field' as const, field: 'isActive', value: false },
          ],
        },
      ],
      storageBackend: 'postgresql' as const,
      schemaVersion: 1,
      storageMetadataStatus: 'ready' as const,
      storageBinding: {
        sql: {
          databaseAlias: 'tenant-postgres',
          tenantSchemaStrategy: 'per-tenant-schema' as const,
          tableName: 'd3ad7caa7d71_vending_machine_app_records',
        },
      },
      status: 'published' as const,
    },
  ],

  // ── Dual-tenant example (uncomment if using dual tenant structure) ──
  // 'vending-machine-app-customer': [ ... ],
  // 'vending-machine-app-staff': [ ... ],
};
