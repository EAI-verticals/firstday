import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const readme = await readFile(new URL('../README.md', import.meta.url), 'utf8');

test('documents the provider-neutral AI workspace handoff', () => {
  assert.match(readme, /eai start --check/);
  assert.match(readme, /eai start/);
  assert.match(readme, /business outcome/i);
  assert.match(readme, /business specification/i);
  assert.match(readme, /provider to read the\s+project/i);
  assert.doesNotMatch(readme, /\/0_business_scenario/);
});
