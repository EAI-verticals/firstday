#!/usr/bin/env node

const tenantId = process.env.EAI_TENANT_ID;
const appBaseUrl = (process.env.APP_BASE_URL || 'http://localhost:3000').replace(/\/+$/, '');
const bearerToken = process.env.EAI_BEARER_TOKEN || '';

if (!tenantId) {
  console.error('EAI_TENANT_ID is required');
  process.exit(1);
}

const targetUrl = `${appBaseUrl}/api/eai/v4/data/resources/${encodeURIComponent(tenantId)}/storage`;
const headers = new Headers({ Accept: 'application/json' });
if (bearerToken) {
  headers.set('Authorization', `Bearer ${bearerToken}`);
}

const response = await fetch(targetUrl, {
  method: 'GET',
  headers,
});

const bodyText = await response.text();
let body;
try {
  body = JSON.parse(bodyText);
} catch {
  body = bodyText;
}

console.log(
  JSON.stringify(
    {
      ok: response.ok,
      status: response.status,
      statusText: response.statusText,
      url: targetUrl,
      error: body && typeof body === 'object' ? body.error || null : null,
      cause: body && typeof body === 'object' ? body.cause || null : null,
      body,
    },
    null,
    2,
  ),
);
