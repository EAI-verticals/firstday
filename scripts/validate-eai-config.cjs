#!/usr/bin/env node

process.env.TS_NODE_COMPILER_OPTIONS = JSON.stringify({
  module: 'CommonJS',
  moduleResolution: 'node',
});
process.env.TS_NODE_TRANSPILE_ONLY = 'true';

require('ts-node/register');

const runtimeContract = require('../eai.runtime.json');
const templateConfig = require('../src/eai.config/default.ts').default;
const {
  validateSecretRefDeclarations,
  validateTemplateDeploymentContract,
} = require('../src/eai.config/deployment-contract.ts');

const failures = [];

const deploymentResult = validateTemplateDeploymentContract(
  templateConfig.deploymentContract,
);
if (!deploymentResult.valid) {
  failures.push(...deploymentResult.errors);
}

const runtimeSecretResult = validateSecretRefDeclarations(
  runtimeContract.secrets && runtimeContract.secrets.declarations,
  'runtime.secrets.declarations',
);
if (!runtimeSecretResult.valid) {
  failures.push(...runtimeSecretResult.errors);
}

if (failures.length > 0) {
  console.error('eai config validation failed:');
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exit(1);
}

console.log('eai config validation passed');
