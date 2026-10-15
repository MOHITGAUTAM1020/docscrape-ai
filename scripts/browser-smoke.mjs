import { chromium } from 'playwright';
import fs from 'node:fs/promises';
import path from 'node:path';
const executable = process.env.BROWSER_EXECUTABLE;
const browser = await chromium.launch({
  headless: true,
  ...(executable ? { executablePath: executable } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const failures = [];
page.on('pageerror', (error) => failures.push(error.message));
const folder = path.resolve('artifacts');
await fs.mkdir(folder, { recursive: true });
try {
  await page.goto(process.env.APP_URL || 'http://localhost:4000');
  await page.getByRole('button', { name: 'Explore live demo' }).click();
  await page.getByRole('heading', { name: 'Turn messy inputs into clear data.' }).waitFor();
  await page.getByRole('button', { name: 'Review Northstar_invoice.txt', exact: true }).waitFor();
  await page.screenshot({ path: path.join(folder, 'dashboard.png'), fullPage: true });
  await page.getByRole('button', { name: 'Review Northstar_invoice.txt', exact: true }).click();
  await page.getByRole('dialog', { name: 'Northstar_invoice.txt' }).waitFor();
  await page.getByRole('textbox', { name: 'Vendor', exact: true }).fill('Browser verified studio');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page
    .getByRole('button', { name: 'Save changes', exact: true })
    .waitFor({ state: 'visible' });
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save changes')
        ?.disabled === true,
  );
  await page.getByRole('button', { name: 'Mark verified' }).click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Mark verified'),
      )?.disabled === false,
  );
  const downloadEvent = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const downloaded = await downloadEvent;
  await downloaded.saveAs(path.join(folder, 'verified-export.json'));
  const data = JSON.parse(await fs.readFile(path.join(folder, 'verified-export.json'), 'utf8'));
  if (!data.extraction.fields.some((f) => f.value === 'Browser verified studio'))
    throw new Error('Edited value missing from export');
  await page.screenshot({ path: path.join(folder, 'document-review.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close document review' }).click();
  // Exercise the actual multi-file upload UI with real Office, PDF and image files.
  // Check the section editor and all exports with a synthetic guide.
  await page.locator('input[type="file"]').setInputFiles({
    name: 'section-guide.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Preparation\n1. Bring water\n2. Wear comfortable clothes\nMeditation\n1. Seated practice\n2. Breathing practice\n',
    ),
  });
  const guideRow = page
    .locator('tr')
    .filter({ has: page.getByRole('button', { name: 'Review section-guide.txt', exact: true }) });
  await guideRow.getByText('Needs review', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Review section-guide.txt', exact: true }).click();
  await page.getByRole('button', { name: 'Sections (2)', exact: true }).waitFor();
  await page
    .getByRole('textbox', { name: 'Section 1 item 1 text', exact: true })
    .fill('Bring a water bottle');
  await page.getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).find((b) => b.textContent === 'Save changes')
        ?.disabled === true,
  );
  const sectionDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'JSON', exact: true }).click();
  const sectionFile = await sectionDownload;
  const sectionData = JSON.parse(await fs.readFile(await sectionFile.path(), 'utf8'));
  if (sectionData.extraction.sections[0].items[0].text !== 'Bring a water bottle')
    throw new Error('Section edits missing from export');
  for (const format of ['CSV', 'XLSX']) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: format, exact: true }).click();
    const file = await pending;
    if (await file.failure()) throw new Error(`${format} section export failed`);
  }
  await page.getByRole('button', { name: 'Close document review' }).click();
  if (process.env.POSTER_IMAGE) {
    await page.locator('input[type="file"]').setInputFiles(process.env.POSTER_IMAGE);
    const name = path.basename(process.env.POSTER_IMAGE);
    const row = page
      .locator('tr')
      .filter({ has: page.getByRole('button', { name: `Review ${name}`, exact: true }) });
    await row.getByText('Needs review', { exact: true }).waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: `Review ${name}`, exact: true }).click();
    await page.getByRole('button', { name: 'Sections (4)', exact: true }).waitFor();
    await page.locator('.source-image img').waitFor();
    await page.waitForFunction(() => document.querySelector('.source-image img')?.naturalWidth > 0);
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'JSON', exact: true }).click();
    const file = await pending;
    const result = JSON.parse(await fs.readFile(await file.path(), 'utf8'));
    if (
      JSON.stringify(result.extraction.sections.map((s) => s.items.length)) !==
      JSON.stringify([7, 10, 4, 3])
    )
      throw new Error('Yoga poster grouping incorrect');
    await fs.mkdir('server/data', { recursive: true });
    await page.screenshot({ path: 'server/data/poster-review.png', fullPage: true });
    await page.getByRole('button', { name: 'Original OCR / text', exact: true }).click();
    await page.locator('.source-paper pre').waitFor();
    await page.getByRole('button', { name: 'Cleaned text', exact: true }).click();
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByRole('button', { name: 'Reprocess document', exact: true }).click();
    await page
      .getByRole('button', { name: 'Sections (4)', exact: true })
      .waitFor({ timeout: 90000 });
    await page.getByRole('button', { name: 'Close document review' }).click();
  }
  await page
    .locator('input[type="file"]')
    .setInputFiles([
      'samples/generated/sample-expenses.xlsx',
      'samples/generated/sample-invoice.docx',
      'samples/generated/sample-invoice.pdf',
      'samples/generated/sample-invoice.png',
    ]);
  await page.getByRole('heading', { name: 'Document library', exact: true }).waitFor();
  for (const name of [
    'sample-expenses.xlsx',
    'sample-invoice.docx',
    'sample-invoice.pdf',
    'sample-invoice.png',
  ]) {
    const row = page
      .locator('tr')
      .filter({ has: page.getByRole('button', { name: `Review ${name}`, exact: true }) });
    await row.getByText('Needs review', { exact: true }).waitFor({ timeout: 90000 });
  }
  await page.getByRole('button', { name: 'Review sample-expenses.xlsx', exact: true }).click();
  await page.getByRole('button', { name: 'Worksheets (2)', exact: true }).click();
  await page.getByRole('heading', { name: 'Metadata', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Close document review' }).click();
  await page
    .locator('.sidebar nav')
    .getByRole('button', { name: /Documents/ })
    .click();
  await page.getByRole('textbox', { name: 'Search documents' }).fill('Project_brief');
  await page.getByRole('button', { name: 'Review Project_brief.txt', exact: true }).waitFor();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('heading', { name: 'Supported document formats' }).waitFor();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.count()) await dismiss.click();
  await page.screenshot({ path: path.join(folder, 'mobile.png'), fullPage: true });
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth > window.innerWidth,
  );
  if (overflow) throw new Error('Mobile page overflows horizontally');
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(
    'Browser smoke passed: login, fields and sections editing, JSON/CSV/XLSX exports, multi-file upload, worksheets, search, settings and mobile layout. Optional poster preview/reprocessing also checked when POSTER_IMAGE is supplied. Screenshots saved in artifacts/.',
  );
} finally {
  await context.close();
  await browser.close();
}
