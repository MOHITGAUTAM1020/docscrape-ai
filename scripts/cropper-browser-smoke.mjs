import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';

const base = process.env.APP_URL || 'http://localhost:4000';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));

try {
  const stamp = Date.now();
  const registration = await context.request.post(`${base}/api/auth/register`, {
    data: {
      name: 'Cropper smoke',
      email: `cropper-${stamp}@example.test`,
      password: 'local-cropper-password',
    },
  });
  if (!registration.ok()) throw new Error(`Registration failed: ${registration.status()}`);

  await page.goto(base);
  await page.getByRole('heading', { name: 'Turn messy inputs into clear data.' }).waitFor();
  const image = await fs.readFile(path.resolve('samples/generated/sample-invoice.png'));
  const upload = await context.request.post(`${base}/api/documents`, {
    multipart: {
      file: { name: 'cropper-fixture.png', mimeType: 'image/png', buffer: image },
    },
  });
  if (!upload.ok()) throw new Error(`Image upload failed: ${upload.status()}`);
  const uploaded = await upload.json();
  let status = uploaded.document.status;
  for (let attempt = 0; attempt < 90 && !['ready', 'failed'].includes(status); attempt++) {
    await page.waitForTimeout(1000);
    const documents = await (await context.request.get(`${base}/api/documents`)).json();
    status = documents.documents.find((item) => item.id === uploaded.document.id)?.status;
  }
  if (status !== 'ready') throw new Error(`Image processing ended with status: ${status}`);
  await page.reload();
  const review = page.getByRole('button', { name: 'Review cropper-fixture.png', exact: true });
  await review.waitFor();
  await review.click();
  await page.getByRole('button', { name: 'Correct & add to training', exact: true }).click();
  const cropper = page.getByRole('dialog', { name: 'Correct & add to training' });
  await cropper.waitFor();
  await page.waitForFunction(() => document.querySelector('.cropper-image img')?.naturalWidth > 0);
  const bounds = await page.locator('.cropper-image').boundingBox();
  if (!bounds) throw new Error('Cropper image has no visible bounds.');
  await page.mouse.move(bounds.x + bounds.width * 0.1, bounds.y + bounds.height * 0.1);
  await page.mouse.down();
  await page.mouse.move(bounds.x + bounds.width * 0.75, bounds.y + bounds.height * 0.22);
  await page.mouse.up();
  await page.getByRole('textbox', { name: 'Exact text on this line' }).fill('Dashboard sample');
  await page
    .getByRole('checkbox', { name: 'I checked that the text exactly matches this crop.' })
    .check();
  await page.getByRole('button', { name: 'Save line' }).click();
  await page.waitForTimeout(1500);
  const savedCount = await page.locator('.cropper-progress strong').textContent();
  if (savedCount !== '1') {
    const notice = await page
      .locator('[role="status"]')
      .textContent()
      .catch(() => 'No error shown');
    throw new Error(`Crop was not saved: ${notice}`);
  }

  const overview = await context.request.get(`${base}/api/training`);
  const lab = await overview.json();
  if (
    lab.samples.length !== 1 ||
    lab.samples[0].text !== 'Dashboard sample' ||
    lab.samples[0].split !== 'test' ||
    lab.samples[0].disposition !== 'usable' ||
    !lab.samples[0].approved
  )
    throw new Error('Saved crop metadata is incorrect.');
  await page.screenshot({ path: path.resolve('artifacts/training-cropper.png'), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error('Training cropper overflows horizontally on mobile.');
  await page.screenshot({
    path: path.resolve('artifacts/training-cropper-mobile.png'),
    fullPage: true,
  });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(
    'Cropper browser smoke passed: select, label, approve and save to held-out test data.',
  );
} finally {
  await context.close();
  await browser.close();
}
