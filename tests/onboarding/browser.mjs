import { chromium } from 'playwright';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { PDFDocument } from 'pdf-lib';

const output = path.resolve('.specify/specs/003-persistent-chat/evidence');
await fs.mkdir(output, { recursive: true });
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1120 } });
const errors = [];
page.on('pageerror', (error) => errors.push(error.message));
const checks = [];
async function check(name, run) {
  await run();
  checks.push({ name, result: 'pass' });
  console.log(`PASS ${name}`);
}
async function nav(name) {
  await page
    .getByRole('navigation', { name: 'Onboarding steps' })
    .getByRole('button', { name: new RegExp('^' + name + ' ') })
    .click();
}
async function download(button, filename) {
  const pending = page.waitForEvent('download');
  await button.click();
  const item = await pending;
  const destination = path.join(output, filename);
  await item.saveAs(destination);
  return destination;
}
try {
  const response = await page.goto(
    'http://127.0.0.1:3001/vending-machine-app',
    { waitUntil: 'networkidle' },
  );
  assert.equal(response.status(), 200);
  await page
    .getByRole('heading', { name: 'Your details', exact: true })
    .waitFor();
  await check('Process starts with details and labels preview', async () => {
    await page.getByText('Local preview', { exact: true }).waitFor();
    await page.screenshot({
      path: path.join(output, 'desktop.png'),
      fullPage: true,
    });
  });
  await check('Required details gate and sequential continuation', async () => {
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page
      .getByRole('heading', { name: 'Your details', exact: true })
      .waitFor();
    await page.getByLabel('Employee name').fill('Alex Morgan');
    await page.getByLabel('Job title').fill('Software engineer');
    await page.getByLabel('Manager', { exact: false }).fill('Jamie Chen');
    await page.getByLabel('Start date').fill('2026-10-05');
    await page.getByRole('button', { name: 'Save and continue' }).click();
    await page
      .getByRole('heading', { name: 'Read and ask', exact: true })
      .waitFor();
    await page
      .getByRole('navigation', { name: 'Onboarding steps' })
      .getByRole('button', { name: 'Your details Complete', exact: true })
      .waitFor();
  });
  await check(
    'Assistant cites sample policy and abstains on unknown facts',
    async () => {
      await nav('Read and ask');
      await page
        .getByRole('button', { name: "What's our PTO policy?", exact: true })
        .click();
      await page.getByText('Paid time off (PTO):', { exact: false }).waitFor();
      await page
        .getByRole('button', { name: 'Employee handbook · Sample' })
        .click();
      await page.getByRole('dialog').waitFor();
      await page.getByRole('button', { name: 'Close dialog' }).click();
      await page
        .getByLabel('Ask an onboarding question')
        .fill('What is the CEO salary?');
      await page.getByRole('button', { name: 'Send message' }).click();
      await page
        .getByText("I don't have that information. Please contact HR.", {
          exact: true,
        })
        .waitFor();
    },
  );
  await check(
    'Chat persists across steps and minimizes with keyboard focus restored',
    async () => {
      const chat = page.getByRole('complementary', {
        name: 'Onboarding chatbot',
      });
      await page
        .getByLabel('Ask an onboarding question')
        .fill('Keep this draft');
      for (const step of [
        'Your details',
        'Prepare documents',
        'Submit for checking',
        'Read and ask',
      ]) {
        await nav(step);
        assert.equal(await chat.isVisible(), true);
        assert.equal(
          await page.getByLabel('Ask an onboarding question').inputValue(),
          'Keep this draft',
        );
        await chat
          .getByText("I don't have that information. Please contact HR.", {
            exact: true,
          })
          .waitFor();
      }
      await page.getByLabel('Ask an onboarding question').press('Escape');
      assert.equal(await chat.isVisible(), false);
      const launcher = page.getByRole('button', {
        name: 'Open onboarding chatbot',
        exact: true,
      });
      assert.equal(
        await launcher.evaluate(
          (element) => element === document.activeElement,
        ),
        true,
      );
      await launcher.click();
      assert.equal(
        await page.getByLabel('Ask an onboarding question').inputValue(),
        'Keep this draft',
      );
      await page.getByLabel('Ask an onboarding question').fill('');
      await page.screenshot({
        path: path.join(output, 'chat-desktop.png'),
        fullPage: true,
      });
    },
  );
  let checklist;
  await check(
    'Profile personalization and four immediate PDF downloads',
    async () => {
      await page.getByRole('button', { name: 'Continue to documents' }).click();
      checklist = await download(
        page.getByRole('button', { name: 'Generate & download' }),
        'checklist.pdf',
      );
      const pdf = await PDFDocument.load(await fs.readFile(checklist));
      assert.equal(
        pdf.getForm().getTextField('Hire date').getText(),
        '2026-10-05',
      );
      assert.equal(pdf.getForm().getFields().length, 7);
      for (const [title, file] of [
        ['Welcome email', 'welcome.pdf'],
        ['IT setup sheet', 'it.pdf'],
        ['Direct deposit form', 'deposit.pdf'],
      ]) {
        await page
          .getByLabel('Document', { exact: true })
          .selectOption({ label: title });
        if (file === 'it.pdf') {
          await page.getByLabel('Work email').fill('alex@example.test');
          await page.getByLabel('Assigned equipment').fill('Laptop LAP-1042');
        }
        const downloaded = await download(
          page.getByRole('button', { name: 'Generate & download' }),
          file,
        );
        assert.ok(
          (
            await PDFDocument.load(await fs.readFile(downloaded))
          ).getPageCount() > 0,
        );
      }
      await page.screenshot({
        path: path.join(output, 'documents-desktop.png'),
        fullPage: true,
      });
    },
  );
  await check('Blank generated PDF fails browser upload checking', async () => {
    await nav('Submit for checking');
    await page
      .getByLabel('Upload completed onboarding document')
      .setInputFiles(checklist);
    await page
      .getByRole('heading', { name: 'A few details need attention' })
      .waitFor({ timeout: 20000 });
    assert.equal(
      await page
        .getByRole('button', { name: 'Mark onboarding as complete' })
        .count(),
      0,
    );
  });
  await check(
    'Completed fillable PDF passes, checked copy includes original, completion is gated',
    async () => {
      const filled = await PDFDocument.load(await fs.readFile(checklist));
      const values = {
        'Employee signature': 'Alex Morgan',
        'Hire date': '2026-10-05',
        'Manager approval': 'Jamie Chen',
        'Emergency contact': 'Sam Morgan +61 400 123 456',
        'Tax forms completed': 'Completed',
        'Background check cleared': 'Cleared',
        'Equipment inventory signed': 'Signed',
      };
      for (const [key, value] of Object.entries(values))
        filled.getForm().getTextField(key).setText(value);
      const complete = path.join(output, 'completed-checklist.pdf');
      await fs.writeFile(complete, await filled.save());
      await page
        .getByRole('button', { name: 'Check another document' })
        .click();
      await page
        .getByLabel('Upload completed onboarding document')
        .setInputFiles(complete);
      await page
        .getByRole('heading', { name: 'All checks passed' })
        .waitFor({ timeout: 20000 });
      const checkedPath = await download(
        page.getByRole('button', { name: 'Download checked copy' }),
        'checked.pdf',
      );
      const checkedPdf = await PDFDocument.load(await fs.readFile(checkedPath));
      assert.ok(checkedPdf.getPageCount() > filled.getPageCount());
      await page
        .getByRole('button', { name: 'Mark onboarding as complete' })
        .click();
      assert.equal(
        await page
          .getByRole('button', { name: 'Onboarding complete', exact: true })
          .isDisabled(),
        true,
      );
      await page.screenshot({
        path: path.join(output, 'verified-desktop.png'),
        fullPage: true,
      });
    },
  );
  await check(
    'Negative text fails and replacement resets completion',
    async () => {
      await page
        .getByRole('button', { name: 'Check another document' })
        .click();
      await page
        .getByLabel('Upload completed onboarding document')
        .setInputFiles({
          name: 'negative.txt',
          mimeType: 'text/plain',
          buffer: Buffer.from(
            'Employee signature: Alex Morgan\nHire date: 2026-10-05\nManager approval: Jamie Chen\nEmergency contact: Sam Morgan +61 400 123 456\nTax forms completed: Not completed\nBackground check cleared: Pending\nEquipment inventory signed: Not signed',
          ),
        });
      await page
        .getByRole('heading', { name: 'A few details need attention' })
        .waitFor();
      assert.equal(
        await page
          .getByRole('button', { name: 'Mark onboarding as complete' })
          .count(),
        0,
      );
      await nav('Your details');
      await page
        .getByRole('navigation', { name: 'Onboarding steps' })
        .getByRole('button', {
          name: 'Submit for checking Not complete',
          exact: true,
        })
        .waitFor();
    },
  );
  await check(
    'Company upload replaces sample, answers cite the imported text',
    async () => {
      await page
        .getByRole('navigation', { name: 'Supporting information' })
        .getByRole('button', { name: 'Company documents' })
        .click();
      await page.getByText('Add company documents', { exact: true }).click();
      await page.getByLabel('Upload knowledge documents').setInputFiles({
        name: 'Acme handbook.txt',
        mimeType: 'text/plain',
        buffer: Buffer.from(
          'Paid time off (PTO): Employees receive 27 days of paid time off. Ask Riley for leave approval.',
        ),
      });
      await page
        .getByRole('button', { name: 'Acme handbook', exact: true })
        .waitFor();
      await nav('Read and ask');
      await page
        .getByRole('button', { name: "What's our PTO policy?", exact: true })
        .click();
      await page
        .getByText('Paid time off (PTO): Employees receive 27 days', {
          exact: false,
        })
        .waitFor();
      await page
        .getByRole('button', { name: 'Acme handbook', exact: true })
        .waitFor();
    },
  );
  await check(
    'Mobile navigation, all views and keyboard dialog have no overflow',
    async () => {
      await page.setViewportSize({ width: 390, height: 844 });
      for (const name of [
        'Your details',
        'Prepare documents',
        'Submit for checking',
        'Read and ask',
      ]) {
        await nav(name);
        assert.ok(
          await page.evaluate(
            () => document.documentElement.scrollWidth <= window.innerWidth,
          ),
        );
        if (name === 'Your details')
          await page.screenshot({
            path: path.join(output, 'mobile.png'),
            fullPage: true,
          });
      }
      await page.getByRole('button', { name: 'Help', exact: true }).click();
      await page.getByRole('dialog').waitFor();
      await page.keyboard.press('Escape');
      assert.equal(await page.getByRole('dialog').count(), 0);
      assert.equal(
        await page
          .getByRole('button', { name: 'Help', exact: true })
          .evaluate((el) => el === document.activeElement),
        true,
      );
      await page.setViewportSize({ width: 1440, height: 1120 });
      await nav('Your details');
    },
  );
  await check(
    'Mobile chatbot opens within viewport and retains draft when minimized',
    async () => {
      const mobile = await browser.newPage({
        viewport: { width: 390, height: 844 },
      });
      await mobile.goto('http://127.0.0.1:3001/vending-machine-app', {
        waitUntil: 'networkidle',
      });
      const chat = mobile.getByRole('complementary', {
        name: 'Onboarding chatbot',
      });
      assert.equal(await chat.isVisible(), false);
      await mobile
        .getByRole('button', { name: 'Open onboarding chatbot', exact: true })
        .click();
      await mobile
        .getByLabel('Ask an onboarding question')
        .fill('Mobile draft');
      const box = await chat.boundingBox();
      assert.ok(
        box &&
          box.x >= 0 &&
          box.y >= 0 &&
          box.x + box.width <= 390 &&
          box.y + box.height <= 844,
      );
      await mobile.screenshot({
        path: path.join(output, 'chat-mobile.png'),
        fullPage: true,
      });
      await chat
        .getByRole('button', { name: 'Minimize chatbot', exact: true })
        .click();
      await mobile
        .getByRole('button', { name: 'Open onboarding chatbot', exact: true })
        .click();
      assert.equal(
        await mobile.getByLabel('Ask an onboarding question').inputValue(),
        'Mobile draft',
      );
      await mobile.close();
    },
  );
  assert.deepEqual(errors, [], `Browser runtime errors: ${errors.join('; ')}`);
  await fs.writeFile(
    path.join(output, 'browser-results.json'),
    JSON.stringify(
      { result: 'pass', checkedAt: new Date().toISOString(), checks, errors },
      null,
      2,
    ),
  );
} catch (error) {
  console.error(error);
  await page.screenshot({
    path: path.join(output, 'browser-failure.png'),
    fullPage: true,
  });
  await fs.writeFile(
    path.join(output, 'browser-results.json'),
    JSON.stringify(
      { result: 'fail', checks, errors, failure: String(error) },
      null,
      2,
    ),
  );
  process.exitCode = 1;
} finally {
  await browser.close();
}
