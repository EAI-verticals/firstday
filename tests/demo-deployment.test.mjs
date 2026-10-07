import assert from 'node:assert/strict';
import test from 'node:test';
import {
  configuration,
  validateCredential,
  runtimeSecrets,
} from '../scripts/demo-deployment.mjs';

test('missing runtime secrets stop configuration without exposing values', () => {
  assert.throws(
    () => runtimeSecrets({ AUTH_SECRET: 'do-not-display' }),
    (error) => {
      assert.match(error.message, /ENTRA_CLIENT_SECRET/);
      assert.match(error.message, /EAI_READINESS_PROBE_TOKEN/);
      assert.ok(!error.message.includes('do-not-display'));
      return true;
    },
  );
});

const approved = {
  EAI_TENANT_ID: 'approved-tenant',
  EAI_WORKFLOW_ID: 'approved-workflow',
  BASE_URL_PUBLIC_API: 'https://api.example.test',
  ROUTING_BOOTSTRAP_PUBLIC_API_URL: 'https://bootstrap.example.test',
  ENTRA_TENANT_NAME: 'ciam',
  ENTRA_TENANT_ID: 'ciam-tenant',
  ENTRA_CLIENT_ID: 'firstday-client',
  ENTRA_SCOPES: 'openid profile api://eai/access_as_user',
  ONBOARDING_DOCUMENT_WORKFLOW_KEY: 'firstday-documents',
};
test('rejects wrong-target credentials without returning secret values', () => {
  const credential = {
    clientId: 'client',
    clientSecret: 'do-not-display',
    subscriptionId: 'wrong-subscription',
    tenantId: 'wrong-tenant',
  };
  assert.throws(
    () => validateCredential(JSON.stringify(credential)),
    (error) => {
      assert.match(error.message, /approved demo subscription/);
      assert.ok(!error.message.includes(credential.clientSecret));
      return true;
    },
  );
  assert.throws(
    () => validateCredential('do-not-display'),
    /service principal JSON/,
  );
});
test('missing tenant stops deployment instead of selecting a default', () => {
  assert.throws(
    () => configuration({ ...approved, EAI_TENANT_ID: '' }),
    /EAI_TENANT_ID/,
  );
});
test('rejects insecure and credential-bearing API URLs', () => {
  for (const value of [
    'http://api.example.test',
    'https://user:password@api.example.test',
  ]) {
    assert.throws(
      () => configuration({ ...approved, BASE_URL_PUBLIC_API: value }),
      /Invalid HTTPS URL/,
    );
  }
});
test('binds server and browser to the same tenant and keeps secret values out', () => {
  const config = configuration({
    ...approved,
    AUTH_SECRET: 'must-not-be-copied',
  });
  assert.equal(
    config.NEXT_PUBLIC_EAI_TENANT_ID,
    config.TENANT_VENDING_MACHINE_APP_ID,
  );
  assert.equal(
    config.WORKFLOW_ONBOARDING_ID,
    config.WORKFLOW_VENDING_MACHINE_APP_ID,
  );
  assert.equal(config.APP_BASE_PATH, '');
  assert.equal(config.AUTH_URL, 'https://firstday.demo.eaigroup.ai/api/auth');
  assert.ok(!JSON.stringify(config).includes('must-not-be-copied'));
  assert.notEqual(
    config.EAI_CONFIG_HASH,
    configuration({ ...approved, EAI_TENANT_ID: 'other-tenant' })
      .EAI_CONFIG_HASH,
  );
});
