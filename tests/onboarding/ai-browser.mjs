import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
const calls = [];
const text =
  'Employee signature: Alex Morgan\nHire date: 2026-10-05\nManager approval: Jamie Chen\nEmergency contact: Sam Morgan +61 400 123 456\nTax forms completed: Completed\nBackground check cleared: Cleared\nEquipment inventory signed: Signed';
await page.route('**/api/auth/session', (route) =>
  route.fulfill({
    json: {
      user: { name: 'Test Employee', email: 'employee@example.test' },
      expires: '2099-01-01T00:00:00Z',
    },
  }),
);
await page.route('**/api/onboarding/config', (route) =>
  route.fulfill({
    json: {
      configured: true,
      tenantId: 'test-workspace',
      workflowId: 'onboarding',
      stages: { answer: 'answer', generate: 'generate', review: 'review' },
    },
  }),
);
await page.route(
  '**/api/eai/v4/ai/chat/test-workspace/onboarding/*',
  async (route) => {
    const stage = route.request().url().split('/').pop();
    const body = route.request().postDataJSON();
    calls.push({ stage, body });
    let result;
    if (stage === 'answer')
      result = {
        answer:
          'This sample policy provides 20 days of paid time off. Submit requests to your manager.',
        sourceId: 'handbook',
        quote: 'full-time employees receive 20 days of paid time off per year.',
      };
    if (stage === 'generate')
      result = {
        title: 'Welcome to Engineering',
        sections: [
          {
            heading: 'Welcome, Alex',
            body: 'We look forward to your first day on 2026-10-05. Jamie Chen is your manager.',
          },
        ],
      };
    if (stage === 'review')
      result = {
        fields: [
          'signature',
          'hire',
          'approval',
          'emergency',
          'tax',
          'background',
          'equipment',
        ].map((key, i) => ({
          key,
          value: text.split('\n')[i].split(': ').slice(1).join(': '),
          evidence: text.split('\n')[i],
          complete: true,
        })),
      };
    await route.fulfill({ json: { response: JSON.stringify(result) } });
  },
);
try {
  await page.goto('http://127.0.0.1:3001/vending-machine-app', {
    waitUntil: 'networkidle',
  });
  await page
    .getByRole('button', { name: 'AI configured', exact: true })
    .waitFor();
  await page
    .getByRole('navigation', { name: 'Onboarding steps' })
    .getByRole('button', { name: /^Read and ask / })
    .click();
  await page
    .getByRole('button', { name: "What's our PTO policy?", exact: true })
    .click();
  await page
    .getByText('This sample policy provides 20 days of paid time off.', {
      exact: false,
    })
    .waitFor();
  await page
    .getByRole('navigation', { name: 'Onboarding steps' })
    .getByRole('button', { name: /^Your details / })
    .click();
  await page.getByLabel('Employee name').fill('Alex Morgan');
  await page.getByLabel('Job title').fill('Software engineer');
  await page.getByLabel('Manager', { exact: false }).fill('Jamie Chen');
  await page.getByLabel('Start date').fill('2026-10-05');
  await page.getByRole('button', { name: 'Save and continue' }).click();
  await page.getByRole('button', { name: 'Continue to documents' }).click();
  await page.getByLabel('Document', { exact: true }).selectOption('welcome');
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate & download' }).click();
  await pending;
  await page
    .getByRole('navigation', { name: 'Onboarding steps' })
    .getByRole('button', { name: /^Submit for checking / })
    .click();
  await page.getByLabel('Upload completed onboarding document').setInputFiles({
    name: 'complete.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(text),
  });
  await page.getByRole('heading', { name: 'All checks passed' }).waitFor();
  assert.deepEqual(
    calls.map((c) => c.stage),
    ['answer', 'generate', 'review'],
  );
  for (const call of calls) {
    assert.equal(call.body.use_context_enrichment, false);
    assert.ok(call.body.conversation_id);
    assert.ok(call.body.message.includes('UNTRUSTED_INPUT_JSON'));
  }
  await page.screenshot({
    path: '.specify/specs/003-persistent-chat/evidence/ai-review-mocked.png',
    fullPage: true,
  });
  await fs.writeFile(
    '.specify/specs/003-persistent-chat/evidence/ai-browser-results.json',
    JSON.stringify(
      {
        result: 'pass',
        evidenceClass: 'mocked browser integration; NOT live EAI execution',
        checkedAt: new Date().toISOString(),
        stages: calls.map((c) => c.stage),
      },
      null,
      2,
    ),
  );
  console.log(
    'PASS all three AI UI paths call EAI adapter (mocked responses; live runtime remains blocked).',
  );
} finally {
  await browser.close();
}
