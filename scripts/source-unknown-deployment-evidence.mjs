#!/usr/bin/env node
import { createHash } from 'node:crypto';
import { createReadStream, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { appendFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { execFileSync } from 'node:child_process';

const SHA256_DIGEST = /^sha256:[a-f0-9]{64}$/;

function parseArgs(argv) {
  const [command = 'collect', ...rest] = argv;
  const options = {};
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (!arg.startsWith('--')) {
      throw new Error(`Unexpected argument: ${arg}`);
    }
    const key = arg.slice(2).replace(/-([a-z])/g, (_, char) => char.toUpperCase());
    const next = rest[index + 1];
    if (!next || next.startsWith('--')) {
      options[key] = 'true';
      continue;
    }
    options[key] = next;
    index += 1;
  }
  return { command, options };
}

function option(options, key, fallback = '') {
  const envKey = key.replace(/[A-Z]/g, (char) => `_${char}`).toUpperCase();
  const value = options[key] ?? process.env[envKey] ?? fallback;
  return typeof value === 'string' ? value.trim() : '';
}

function ensureDir(path) {
  mkdirSync(path, { recursive: true });
}

function assertExists(path, label) {
  if (!existsSync(path)) {
    throw new Error(`${label} does not exist: ${path}`);
  }
}

function listFiles(root, relativeRoot = '.') {
  const absoluteRoot = join(root, relativeRoot);
  if (!existsSync(absoluteRoot)) return [];
  return readdirSync(absoluteRoot, { withFileTypes: true })
    .flatMap((entry) => {
      const relativePath = join(relativeRoot, entry.name);
      if (entry.isDirectory()) return listFiles(root, relativePath);
      return entry.isFile() ? [relativePath.replaceAll('\\', '/')] : [];
    })
    .sort();
}

async function digestFile(path) {
  const hash = createHash('sha256');
  await new Promise((resolvePromise, reject) => {
    createReadStream(path)
      .on('data', (chunk) => hash.update(chunk))
      .on('error', reject)
      .on('end', resolvePromise);
  });
  return `sha256:${hash.digest('hex')}`;
}

function digestFiles(root, paths) {
  const hash = createHash('sha256');
  for (const relativePath of paths.filter((path) => existsSync(join(root, path))).sort()) {
    hash.update(relativePath);
    hash.update('\0');
    hash.update(readFileSync(join(root, relativePath)));
    hash.update('\0');
  }
  return `sha256:${hash.digest('hex')}`;
}

function readSchemaProvenance(root) {
  const fixture = join(root, 'tests/fixtures/schema-provenance/valid.json');
  assertExists(fixture, 'Schema provenance fixture');
  const provenance = JSON.parse(readFileSync(fixture, 'utf8'));
  for (const key of ['schemaDigest', 'validatorDigest']) {
    if (!SHA256_DIGEST.test(provenance[key] || '')) {
      throw new Error(`Schema provenance ${key} must be a sha256 digest.`);
    }
  }
  if (!/^[a-f0-9]{40}$/.test(provenance.baseTemplateSha || '')) {
    throw new Error('Schema provenance baseTemplateSha must be a 40 character lowercase git SHA.');
  }
  if (!provenance.templateVersion) {
    throw new Error('Schema provenance templateVersion is required.');
  }
  return provenance;
}

function buildConfigHash(root) {
  return digestFiles(root, [
    'eai.runtime.json',
    'src/eai.config/default.ts',
    'src/eai.config/index.ts',
    'src/eai.config/object-types.json',
    'src/eai.config/object-types.provisioning.json',
    'src/eai.config/object-types.ts',
    'src/eai.config/register.ts',
  ]);
}

function packageAppArtifact(root, archivePath) {
  const required = ['.next/standalone', '.next/static', 'package.json', 'eai.runtime.json'];
  for (const path of required) assertExists(join(root, path), path);

  const entries = [...required];
  if (existsSync(join(root, 'public'))) entries.push('public');
  if (existsSync(join(root, 'src/eai.config/object-types.json'))) entries.push('src/eai.config/object-types.json');
  if (existsSync(join(root, 'src/eai.config/object-types.provisioning.json'))) {
    entries.push('src/eai.config/object-types.provisioning.json');
  }

  ensureDir(dirname(archivePath));
  rmSync(archivePath, { force: true });
  execFileSync('tar', ['-czf', archivePath, ...entries], { cwd: root, stdio: 'inherit' });
  return entries;
}

function prepareImageContext(options) {
  const root = resolve(option(options, 'root', process.cwd()));
  const buildDir = resolve(root, option(options, 'buildDir', '.next'));
  const contextDir = resolve(root, option(options, 'contextDir', '.eai-build/image-context'));
  const standaloneDir = join(buildDir, 'standalone');
  const staticDir = join(buildDir, 'static');

  assertExists(standaloneDir, 'Next standalone build');
  assertExists(staticDir, 'Next static build');
  rmSync(contextDir, { recursive: true, force: true });
  ensureDir(contextDir);
  execFileSync('cp', ['-R', `${standaloneDir}/.`, contextDir]);
  ensureDir(join(contextDir, '.next'));
  execFileSync('cp', ['-R', staticDir, join(contextDir, '.next/static')]);
  if (existsSync(join(root, 'public'))) {
    execFileSync('cp', ['-R', join(root, 'public'), join(contextDir, 'public')]);
  } else {
    ensureDir(join(contextDir, 'public'));
  }
  writeFileSync(
    join(contextDir, 'Dockerfile'),
    [
      'FROM node:20-alpine',
      'WORKDIR /app',
      'ENV NODE_ENV=production',
      'ENV PORT=3000',
      'ENV HOSTNAME=0.0.0.0',
      'COPY . .',
      'EXPOSE 3000',
      'CMD ["node", "server.js"]',
      '',
    ].join('\n'),
  );
  process.stdout.write(`${contextDir}\n`);
}

async function appendOutputs(path, outputs) {
  if (!path) return;
  const lines = Object.entries(outputs).map(([key, value]) => `${key}=${value}\n`).join('');
  await appendFile(path, lines, 'utf8');
}

async function collectEvidence(options) {
  const root = resolve(option(options, 'root', process.cwd()));
  const outputDir = resolve(root, option(options, 'outputDir', '.eai-build/evidence'));
  const archivePath = resolve(root, option(options, 'artifactArchive', '.eai-build/eai-app-build.tar.gz'));
  const imageArchivePath = resolve(root, option(options, 'imageArchive', '.eai-build/eai-app-image.oci.tar'));
  const evidencePath = resolve(outputDir, option(options, 'evidenceFile', 'source-unknown-deployment-evidence.json'));
  const githubOutputPath = option(options, 'githubOutput', process.env.GITHUB_OUTPUT || '');

  assertExists(imageArchivePath, 'OCI image archive');
  const artifactEntries = packageAppArtifact(root, archivePath);
  const artifactDigest = await digestFile(archivePath);
  const imageDigest = await digestFile(imageArchivePath);
  const configHash = buildConfigHash(root);
  const schemaProvenance = readSchemaProvenance(root);

  const workflowPath = option(options, 'workflow', '.github/workflows/eai-app.yml');
  const branch = option(options, 'branch', process.env.GITHUB_REF_NAME || 'main');
  const ref = option(options, 'ref', process.env.GITHUB_REF || `refs/heads/${branch}`);
  const commitSha = option(options, 'commit', process.env.GITHUB_SHA || '');
  const repo = option(options, 'repo', process.env.GITHUB_REPOSITORY || '');
  const environment = option(options, 'environment', 'preview');

  const evidence = {
    contract: 'source-unknown-app-template-deployment-handoff',
    sourceMode: 'source-unknown',
    appKey: option(options, 'appKey'),
    tenantId: option(options, 'tenantId'),
    environment,
    repository: repo,
    workflowPath,
    ref,
    branch,
    commitSha,
    workflowRun: {
      id: option(options, 'workflowRunId', process.env.GITHUB_RUN_ID || ''),
      attempt: option(options, 'workflowRunAttempt', process.env.GITHUB_RUN_ATTEMPT || ''),
    },
    configHash,
    artifact: {
      path: relative(root, archivePath).replaceAll('\\', '/'),
      digest: artifactDigest,
      entries: artifactEntries,
      fileCount: listFiles(root, '.next/standalone').length + listFiles(root, '.next/static').length,
    },
    image: {
      path: relative(root, imageArchivePath).replaceAll('\\', '/'),
      format: 'oci-archive',
      digest: imageDigest,
      bytes: statSync(imageArchivePath).size,
    },
    schemaProvenance,
    handoff: {
      requestedThrough: 'eai app deploy-source-unknown',
      expectedStatus: 'handoff_pending',
      tenantInfraImplementedHere: false,
    },
  };

  ensureDir(outputDir);
  writeFileSync(evidencePath, `${JSON.stringify(evidence, null, 2)}\n`);
  await appendOutputs(githubOutputPath, {
    config_hash: configHash,
    artifact_digest: artifactDigest,
    image_digest: imageDigest,
    evidence_path: evidencePath,
    template_version: schemaProvenance.templateVersion,
    base_template_sha: schemaProvenance.baseTemplateSha,
    schema_digest: schemaProvenance.schemaDigest,
    validator_digest: schemaProvenance.validatorDigest,
  });
  process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function responseStatus(payload) {
  if (payload?.response && typeof payload.response === 'object') {
    return {
      status: payload.response.status,
      requiresTenantInfra: payload.response.requiresTenantInfra,
      deploymentRequestId: payload.response.deploymentRequestId,
    };
  }
  return {
    status: payload?.status,
    requiresTenantInfra: payload?.requiresTenantInfra,
    deploymentRequestId: payload?.deploymentRequestId,
  };
}

function assertHandoffSubmitted(options) {
  const responsePath = resolve(option(options, 'response'));
  assertExists(responsePath, 'Deployment handoff response');
  const actual = responseStatus(readJson(responsePath));
  if (!['handoff_pending', 'accepted'].includes(actual.status)) {
    throw new Error(
      `Expected deployment handoff status handoff_pending or accepted, got ${actual.status || '<missing>'}.`,
    );
  }
  if (actual.status === 'handoff_pending' && actual.requiresTenantInfra !== true) {
    throw new Error('Expected deployment handoff to require TenantInfra.');
  }
  process.stdout.write(`${actual.status} ${actual.deploymentRequestId || ''}\n`);
}

const { command, options } = parseArgs(process.argv.slice(2));

if (command === 'prepare-image-context') {
  prepareImageContext(options);
} else if (command === 'collect') {
  await collectEvidence(options);
} else if (command === 'assert-handoff-submitted' || command === 'assert-handoff-pending') {
  assertHandoffSubmitted(options);
} else {
  throw new Error(`Unknown command: ${command}`);
}
