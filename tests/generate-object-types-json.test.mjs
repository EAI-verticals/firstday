import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import {
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const generatorScript = join(
  repoRoot,
  'scripts/generate-object-types-json.mjs',
);

test('object type generator accepts scaffolded TypeScript const assertions', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'eai-object-types-generator-'));
  try {
    const inputPath = join(workDir, 'object-types.ts');
    const outputPath = join(workDir, 'object-types.json');
    const provisioningOutputPath = join(
      workDir,
      'object-types.provisioning.json',
    );

    mkdirSync(dirname(inputPath), { recursive: true });
    writeFileSync(
      inputPath,
      `
export type StorageBackend = 'postgresql' | 'documentdb' | 'blob' | 'search';

export interface ObjectTypeDefinition {
  name: string;
  slug: string;
  storageBackend: StorageBackend;
}

export const objectTypes: Record<string, ObjectTypeDefinition[]> = {
  postPilot: [
    {
      name: 'Campaign',
      slug: 'campaign',
      displayName: 'Campaign',
      storageBackend: 'postgresql' as const,
      status: 'published' as const,
      properties: [
        { name: 'title', type: 'text' as const, required: true },
      ] as const,
    },
  ],
};
`,
    );

    execFileSync(process.execPath, [generatorScript], {
      env: {
        ...process.env,
        EAI_OBJECT_TYPES_INPUT_PATH: inputPath,
        EAI_OBJECT_TYPES_OUTPUT_PATH: outputPath,
        EAI_OBJECT_TYPES_PROVISIONING_OUTPUT_PATH: provisioningOutputPath,
      },
      stdio: 'pipe',
    });

    const objectTypes = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(objectTypes.postPilot[0].name, 'Campaign');
    assert.equal(objectTypes.postPilot[0].storageBackend, 'postgresql');
    assert.equal(objectTypes.postPilot[0].properties[0].type, 'text');

    const provisioning = JSON.parse(
      readFileSync(provisioningOutputPath, 'utf8'),
    );
    assert.deepEqual(provisioning[0].declaredBackends, ['postgresql']);
    assert.deepEqual(
      provisioning[0].objectTypeIdentifiersByBackend.postgresql,
      [{ name: 'Campaign', slug: 'campaign' }],
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('object type generator accepts typed helper functions used by the scaffold', () => {
  const workDir = mkdtempSync(
    join(tmpdir(), 'eai-object-types-generator-helpers-'),
  );
  try {
    const inputPath = join(workDir, 'object-types.ts');
    const outputPath = join(workDir, 'object-types.json');
    const provisioningOutputPath = join(
      workDir,
      'object-types.provisioning.json',
    );

    mkdirSync(dirname(inputPath), { recursive: true });
    writeFileSync(
      inputPath,
      `
export type StorageBackend = 'postgresql' | 'documentdb' | 'blob' | 'search';

function tenantStorageScope(tenantId: string): string {
  return tenantId.replace(/[^a-z0-9]+/g, '').slice(-12) || 'tenant';
}

function appSqlStorage(logicalTableName: string) {
  const tenantId = process.env.EAI_TENANT_ID || 'tenant';
  const tablePrefix = \`\${tenantStorageScope(tenantId)}_demo_\`;
  return {
    storageBackend: 'postgresql' as const,
    status: 'published' as const,
    storageBinding: {
      sql: {
        databaseAlias: 'tenant-postgres' as const,
        tenantSchemaStrategy: 'per-tenant-schema' as const,
        tableName: \`\${tablePrefix}\${logicalTableName}\`,
      },
    },
  };
}

export const objectTypes = {
  demo: [
    {
      name: 'DemoRecord',
      slug: 'demo-record',
      displayName: 'Demo Record',
      ...appSqlStorage('records'),
      properties: [
        { name: 'title', type: 'text' as const, required: true },
      ] as const,
    },
  ],
};
`,
    );

    execFileSync(process.execPath, [generatorScript], {
      env: {
        ...process.env,
        EAI_TENANT_ID: 'tenant-1234',
        EAI_OBJECT_TYPES_INPUT_PATH: inputPath,
        EAI_OBJECT_TYPES_OUTPUT_PATH: outputPath,
        EAI_OBJECT_TYPES_PROVISIONING_OUTPUT_PATH: provisioningOutputPath,
      },
      stdio: 'pipe',
    });

    const objectTypes = JSON.parse(readFileSync(outputPath, 'utf8'));
    assert.equal(
      objectTypes.demo[0].storageBinding.sql.databaseAlias,
      'tenant-postgres',
    );
    assert.match(
      objectTypes.demo[0].storageBinding.sql.tableName,
      /demo_records$/,
    );

    const provisioning = JSON.parse(
      readFileSync(provisioningOutputPath, 'utf8'),
    );
    assert.deepEqual(provisioning[0].declaredBackends, ['postgresql']);
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('object type generator rejects missing, malformed, reserved, and mismatched pairs without replacing either output', () => {
  const workDir = mkdtempSync(
    join(tmpdir(), 'eai-object-types-generator-invalid-'),
  );
  try {
    const inputPath = join(workDir, 'object-types.ts');
    const outputPath = join(workDir, 'object-types.json');
    const provisioningOutputPath = join(
      workDir,
      'object-types.provisioning.json',
    );
    writeFileSync(outputPath, '{"preserved":true}\n');
    writeFileSync(provisioningOutputPath, '["preserved"]\n');

    for (const source of [
      `export const objectTypes = { demo: [{ name: 'FeedItem', storageBackend: 'postgresql' }] };`,
      `export const objectTypes = { demo: [{ name: 'feed-item', slug: 'feed-item', storageBackend: 'postgresql' }] };`,
      `export const objectTypes = { demo: [{ name: 'Operations', slug: 'operations', storageBackend: 'postgresql' }] };`,
      `export const objectTypes = { demo: [{ name: 'FeedItem', slug: 'feeditem', storageBackend: 'postgresql' }] };`,
    ]) {
      writeFileSync(inputPath, source);
      assert.throws(() =>
        execFileSync(process.execPath, [generatorScript], {
          env: {
            ...process.env,
            EAI_OBJECT_TYPES_INPUT_PATH: inputPath,
            EAI_OBJECT_TYPES_OUTPUT_PATH: outputPath,
            EAI_OBJECT_TYPES_PROVISIONING_OUTPUT_PATH: provisioningOutputPath,
          },
          stdio: 'pipe',
        }),
      );
      assert.equal(readFileSync(outputPath, 'utf8'), '{"preserved":true}\n');
      assert.equal(
        readFileSync(provisioningOutputPath, 'utf8'),
        '["preserved"]\n',
      );
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
