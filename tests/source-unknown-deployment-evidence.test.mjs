import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { cpSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const evidenceScript = join(repoRoot, 'scripts/source-unknown-deployment-evidence.mjs');
const workflowPath = join(repoRoot, '.github/workflows/eai-app.yml');
const digestPattern = /^sha256:[a-f0-9]{64}$/;

function writeFixtureApp(root) {
  mkdirSync(join(root, '.next/standalone'), { recursive: true });
  mkdirSync(join(root, '.next/static'), { recursive: true });
  mkdirSync(join(root, 'src/eai.config'), { recursive: true });
  mkdirSync(join(root, 'tests/fixtures/schema-provenance'), { recursive: true });
  mkdirSync(join(root, '.eai-build'), { recursive: true });

  writeFileSync(join(root, '.next/standalone/server.js'), 'console.log("ok");\n');
  writeFileSync(join(root, '.next/static/app.js'), 'static\n');
  writeFileSync(join(root, 'package.json'), '{"name":"fixture-app"}\n');
  writeFileSync(join(root, 'eai.runtime.json'), '{"runtime":"fixture"}\n');
  writeFileSync(join(root, 'src/eai.config/object-types.json'), '{"types":[]}\n');
  writeFileSync(join(root, '.eai-build/eai-app-image.oci.tar'), 'oci image archive fixture\n');

  cpSync(
    join(repoRoot, 'tests/fixtures/schema-provenance/valid.json'),
    join(root, 'tests/fixtures/schema-provenance/valid.json'),
  );
}

function runEvidenceScript(args, options = {}) {
  return execFileSync(process.execPath, [evidenceScript, ...args], {
    encoding: 'utf8',
    ...options,
  });
}

test('collect writes source-unknown handoff evidence and GitHub outputs', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'eai-source-unknown-evidence-'));
  try {
    const fixtureRoot = join(workDir, 'app');
    const outputFile = join(workDir, 'github-output.txt');
    writeFixtureApp(fixtureRoot);

    const stdout = runEvidenceScript([
      'collect',
      '--root',
      fixtureRoot,
      '--app-key',
      'rates-review',
      '--tenant-id',
      'tenant-parent',
      '--repo',
      'enterpriseaigroup/rates-review',
      '--workflow',
      '.github/workflows/eai-app.yml',
      '--ref',
      'refs/heads/main',
      '--branch',
      'main',
      '--commit',
      'abcdef1234567890abcdef1234567890abcdef12',
      '--workflow-run-id',
      '123456789',
      '--workflow-run-attempt',
      '1',
      '--github-output',
      outputFile,
    ]);

    const evidencePath = join(fixtureRoot, '.eai-build/evidence/source-unknown-deployment-evidence.json');
    const evidence = JSON.parse(readFileSync(evidencePath, 'utf8'));
    assert.deepEqual(JSON.parse(stdout), evidence);
    assert.equal(evidence.contract, 'source-unknown-app-template-deployment-handoff');
    assert.equal(evidence.sourceMode, 'source-unknown');
    assert.equal(evidence.handoff.expectedStatus, 'handoff_pending');
    assert.equal(evidence.handoff.tenantInfraImplementedHere, false);
    assert.match(evidence.configHash, digestPattern);
    assert.match(evidence.artifact.digest, digestPattern);
    assert.match(evidence.image.digest, digestPattern);

    const outputs = readFileSync(outputFile, 'utf8');
    for (const key of [
      'config_hash',
      'artifact_digest',
      'image_digest',
      'template_version',
      'base_template_sha',
      'schema_digest',
      'validator_digest',
    ]) {
      assert.match(outputs, new RegExp(`^${key}=`, 'm'));
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('workflow sends source metadata in deployment handoff', () => {
  const workflow = readFileSync(workflowPath, 'utf8');
  const handoffStep = workflow.match(
    /- name: Request deployment handoff[\s\S]*?- name: Assert TenantInfra handoff submitted/,
  )?.[0];

  assert.ok(handoffStep, 'Request deployment handoff step must exist');
  assert.match(handoffStep, /--repo "\$GITHUB_REPOSITORY"/);
  assert.match(handoffStep, /--workflow-run-id "\$GITHUB_RUN_ID"/);
});

test('assert-handoff-submitted accepts pending and accepted TenantInfra handoff responses', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'eai-source-unknown-handoff-'));
  try {
    for (const status of ['handoff_pending', 'accepted']) {
      const responsePath = join(workDir, `deployment-response-${status}.json`);
      writeFileSync(
        responsePath,
        JSON.stringify({
          response: {
            status,
            deploymentRequestId: 'source-unknown-deploy-1',
            requiresTenantInfra: status === 'handoff_pending',
          },
        }),
      );

      const stdout = runEvidenceScript(['assert-handoff-submitted', '--response', responsePath]);
      assert.match(stdout, new RegExp(`^${status} source-unknown-deploy-1`));
    }
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});

test('assert-handoff-submitted rejects completed or missing handoff responses', () => {
  const workDir = mkdtempSync(join(tmpdir(), 'eai-source-unknown-handoff-bad-'));
  try {
    const responsePath = join(workDir, 'deployment-response-bad.json');
    writeFileSync(
      responsePath,
      JSON.stringify({
        response: {
          status: 'deployed',
          deploymentRequestId: 'source-unknown-deploy-1',
          requiresTenantInfra: false,
        },
      }),
    );

    const result = spawnSync(
      process.execPath,
      [evidenceScript, 'assert-handoff-submitted', '--response', responsePath],
      { encoding: 'utf8' },
    );
    assert.equal(result.status, 1);
    assert.match(
      result.stderr,
      /Expected deployment handoff status handoff_pending or accepted/,
    );
  } finally {
    rmSync(workDir, { recursive: true, force: true });
  }
});
