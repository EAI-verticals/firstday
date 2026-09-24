#!/usr/bin/env node
/**
 * Generate object-types.json from object-types.ts
 *
 * Strips TypeScript type declarations, evaluates the runtime JS, and writes
 * the resulting JSON to src/eai.config/object-types.json.
 *
 * Usage:
 *   node scripts/generate-object-types-json.mjs
 *   npm run build:object-types
 */

import {
  existsSync,
  readFileSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const projectRoot = join(__dirname, '..');
const inputPath =
  process.env.EAI_OBJECT_TYPES_INPUT_PATH ??
  join(projectRoot, 'src/eai.config/object-types.ts');
const outputPath =
  process.env.EAI_OBJECT_TYPES_OUTPUT_PATH ??
  join(projectRoot, 'src/eai.config/object-types.json');
const provisioningOutputPath =
  process.env.EAI_OBJECT_TYPES_PROVISIONING_OUTPUT_PATH ??
  join(projectRoot, 'src/eai.config/object-types.provisioning.json');

const BACKEND_ORDER = ['postgresql', 'documentdb', 'blob', 'search'];
const NAME_PATTERN = /^[A-Z][A-Za-z0-9]*$/;
const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const RESERVED_SLUGS = new Set(['operations', 'query', 'search', 'storage']);
const ESTABLISHED_NAME_SLUGS = new Map([['GitHubConnection', 'github-connection']]);
const checkOnly = process.argv.includes('--check');

function deriveObjectTypeSlugV1(value) {
  const normalizedName = value.trim();
  const derivationSource = ESTABLISHED_NAME_SLUGS.get(normalizedName) ?? normalizedName;

  return derivationSource
    .replace(/([A-Z])([A-Z][a-z])/g, '$1-$2')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function validateObjectTypes(objectTypesByTenant) {
  if (
    typeof objectTypesByTenant !== 'object' ||
    objectTypesByTenant === null ||
    Array.isArray(objectTypesByTenant)
  ) {
    throw new Error('objectTypes must be a tenant-keyed object');
  }

  for (const [tenantKey, types] of Object.entries(objectTypesByTenant)) {
    if (!Array.isArray(types)) {
      throw new Error(`objectTypes.${tenantKey} must be an array`);
    }
    for (const [index, type] of types.entries()) {
      const location = `objectTypes.${tenantKey}[${index}]`;
      if (typeof type !== 'object' || type === null || Array.isArray(type)) {
        throw new Error(`${location} must be an object`);
      }
      if (typeof type.name !== 'string' || !NAME_PATTERN.test(type.name)) {
        throw new Error(`${location}.name must match PascalCase v1 syntax`);
      }
      if (typeof type.slug !== 'string' || !type.slug) {
        throw new Error(`${location}.slug is required`);
      }
      if (!SLUG_PATTERN.test(type.slug) || RESERVED_SLUGS.has(type.slug)) {
        throw new Error(`${location}.slug must be a non-reserved v1 slug`);
      }
      const expectedSlug = deriveObjectTypeSlugV1(type.name);
      if (type.slug !== expectedSlug) {
        throw new Error(`${location}.slug must equal ${expectedSlug}`);
      }
      if (!BACKEND_ORDER.includes(type.storageBackend)) {
        throw new Error(
          `${location}.storageBackend must be a supported backend`,
        );
      }
    }
  }
}

function replaceOutputsAtomically(outputs) {
  const temporaryOutputs = outputs.map(({ path, contents }) => ({
    path,
    hadOriginal: existsSync(path),
    temporaryPath: `${path}.tmp-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    backupPath: `${path}.bak-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}`,
    contents,
  }));

  try {
    for (const output of temporaryOutputs) {
      writeFileSync(output.temporaryPath, output.contents, 'utf-8');
    }

    // Stage every current output first. If one replacement fails, restore all
    // staged originals so callers never observe a one-file generated pair.
    for (const output of temporaryOutputs) {
      if (output.hadOriginal) {
        renameSync(output.path, output.backupPath);
      }
    }
    for (const output of temporaryOutputs) {
      renameSync(output.temporaryPath, output.path);
    }
    for (const output of temporaryOutputs) {
      if (existsSync(output.backupPath)) unlinkSync(output.backupPath);
    }
  } catch (error) {
    for (const output of temporaryOutputs) {
      if (existsSync(output.backupPath)) {
        if (existsSync(output.path)) unlinkSync(output.path);
        renameSync(output.backupPath, output.path);
      } else if (!output.hadOriginal && existsSync(output.path)) {
        unlinkSync(output.path);
      }
    }
    throw error;
  } finally {
    for (const output of temporaryOutputs) {
      try {
        unlinkSync(output.temporaryPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
      try {
        unlinkSync(output.backupPath);
      } catch (error) {
        if (error?.code !== 'ENOENT') throw error;
      }
    }
  }
}

function assertGeneratedOutput(path, expected) {
  let current;
  try {
    current = readFileSync(path, 'utf-8');
  } catch {
    throw new Error(`${path} is missing; run npm run build:object-types`);
  }
  if (current !== expected) {
    throw new Error(`${path} is stale; run npm run build:object-types`);
  }
}

function summarizeProvisioning(objectTypesByTenant) {
  return Object.entries(objectTypesByTenant).map(([tenantKey, types]) => {
    const objectTypesByBackend = {
      postgresql: [],
      documentdb: [],
      blob: [],
      search: [],
    };
    const objectTypeIdentifiersByBackend = {
      postgresql: [],
      documentdb: [],
      blob: [],
      search: [],
    };

    for (const type of types) {
      objectTypesByBackend[type.storageBackend].push(type.name);
      objectTypeIdentifiersByBackend[type.storageBackend].push({
        name: type.name,
        slug: type.slug,
      });
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

    const notes = [];
    if (objectTypesByBackend.documentdb.length > 0) {
      notes.push(
        'DocumentDB object types require a dedicated ResourceAPI DocumentDB plus PostgreSQL shadow records for links, history, and query parity.',
      );
    }
    if (objectTypesByBackend.blob.length > 0) {
      notes.push(
        'Blob object types require Blob Storage plus PostgreSQL shadow records for metadata, links, history, and aggregate/list behavior.',
      );
    }
    if (objectTypesByBackend.search.length > 0) {
      notes.push(
        'Search is a derived projection backend, not the primary system of record. Provision AI Search intentionally and pair it with a canonical write store.',
      );
    }
    if (
      objectTypesByBackend.search.length > 0 &&
      !requiresPostgresql &&
      objectTypesByBackend.documentdb.length === 0 &&
      objectTypesByBackend.blob.length === 0
    ) {
      notes.push(
        'Search-only object type sets are not sufficient for canonical runtime data. Add a canonical backend before relying on runtime writes.',
      );
    }

    return {
      tenantKey,
      declaredBackends,
      objectTypesByBackend,
      objectTypeIdentifiersByBackend,
      provision: {
        postgresql: requiresPostgresql,
        documentdb: objectTypesByBackend.documentdb.length > 0,
        blob: objectTypesByBackend.blob.length > 0,
        search: objectTypesByBackend.search.length > 0,
      },
      notes,
    };
  });
}

// Read TypeScript source
const tsContent = readFileSync(inputPath, 'utf-8');

// Strip TypeScript-only syntax to produce valid JavaScript
let jsContent = tsContent;

// Remove type/interface/enum declarations (single-line and multi-line)
const lines = jsContent.split('\n');
const cleaned = [];
let inBlock = false;
let inTypeAlias = false;
let braceDepth = 0;

for (const line of lines) {
  const stripped = line.trim();

  // Skip standalone type/interface/enum declarations
  if (
    /^export\s+(type|interface|enum)\s+/.test(stripped) ||
    /^(type|interface|enum)\s+/.test(stripped)
  ) {
    if (stripped.endsWith(';') && !stripped.includes('{')) {
      continue; // Single-line type alias
    }
    if (/^(export\s+)?type\s+/.test(stripped) && !stripped.includes('{')) {
      inBlock = true;
      inTypeAlias = true;
      continue;
    }
    // Multi-line block
    inBlock = true;
    inTypeAlias = false;
    braceDepth =
      (stripped.match(/{/g) || []).length - (stripped.match(/}/g) || []).length;
    if (braceDepth <= 0) inBlock = false;
    continue;
  }

  if (inBlock) {
    if (inTypeAlias) {
      if (stripped.endsWith(';')) {
        inBlock = false;
        inTypeAlias = false;
      }
      continue;
    }
    braceDepth +=
      (stripped.match(/{/g) || []).length - (stripped.match(/}/g) || []).length;
    if (braceDepth <= 0) inBlock = false;
    continue;
  }

  // Strip type annotations from const declarations
  let cleanedLine = line
    .replace(/export\s+const\s+(\w+)\s*:\s*[^=]+=/, 'const $1 =')
    .replace(/^(\s*)const\s+(\w+)\s*:\s*[^=]+=/, '$1const $2 =')
    .replace(
      /^(\s*)function\s+(\w+)\s*\(([^)]*)\)\s*(?::\s*[^{]+)?\{/,
      (_, indent, name, params) => {
        const cleanedParams = params
          .split(',')
          .map((param) => param.trim())
          .filter(Boolean)
          .map((param) => param.replace(/:\s*.+$/, ''))
          .join(', ');
        return `${indent}function ${name}(${cleanedParams}) {`;
      },
    )
    .replace(/\s+as\s+const\b/g, '')
    .replace('export const', 'const')
    .replace('export default', 'const objectTypes =');

  cleaned.push(cleanedLine);
}

// Evaluate the cleaned JavaScript to extract the objectTypes value
const evalCode = cleaned.join('\n') + '\n\nobjectTypes;';
const objectTypes = (0, eval)(evalCode);

// Validate all source pairs before either tracked output can be replaced.
validateObjectTypes(objectTypes);

const json = JSON.stringify(objectTypes, null, 2);
const provisioning = summarizeProvisioning(objectTypes);
const provisioningJson = JSON.stringify(provisioning, null, 2);
const outputs = [
  { path: outputPath, contents: `${json}\n` },
  { path: provisioningOutputPath, contents: `${provisioningJson}\n` },
];

if (checkOnly) {
  for (const output of outputs)
    assertGeneratedOutput(output.path, output.contents);
} else {
  replaceOutputsAtomically(outputs);
}

// Summary
const tenantKeys = Object.keys(objectTypes);
const totalTypes = tenantKeys.reduce(
  (sum, key) => sum + objectTypes[key].length,
  0,
);
console.log(`${checkOnly ? 'Verified' : 'Generated'} ${outputPath}`);
console.log(
  `${checkOnly ? 'Verified' : 'Generated'} ${provisioningOutputPath}`,
);
console.log(`  ${tenantKeys.length} tenant(s): ${tenantKeys.join(', ')}`);
console.log(`  ${totalTypes} Object Type(s) total`);
