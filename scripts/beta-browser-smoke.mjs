import { chromium } from 'playwright';
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
      name: 'Beta route smoke',
      email: `beta-route-${stamp}@example.test`,
      password: 'beta-route-password',
    },
  });
  if (!registration.ok()) throw new Error(`Registration failed: ${registration.status()}`);
  await page.goto(base);
  await page.getByRole('heading', { name: 'Turn messy inputs into clear data.' }).waitFor();

  await page.getByRole('button', { name: 'Upload documents', exact: true }).click();
  const uploadDialog = page.getByRole('dialog', { name: 'Upload documents' });
  await uploadDialog.waitFor();
  if ((await uploadDialog.getByRole('radio').count()) !== 5)
    throw new Error('Upload dialog does not expose all five extraction routes.');
  await page.screenshot({ path: path.resolve('artifacts/beta-upload-routes.png'), fullPage: true });
  await page.getByRole('button', { name: 'Close upload' }).click();

  const route = page.locator('.profile-rail').getByRole('button', { name: /Job description/ });
  await route.click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'support-developer.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      [
        'Job Description: Full Stack Support Developer',
        'Overview',
        'Support reliable production applications.',
        'Responsibilities',
        'Production Support: Diagnose live incidents.',
        'Bug Resolution: Reproduce and resolve defects.',
        'Minimum Requirements',
        'Minimum of 2 years of full-stack experience.',
        'Preferred Qualifications',
        'Experience with GCP and Docker.',
        'Shift Requirements',
        'Ability to work a 10:00 PM to 7:00 AM IST shift.',
      ].join('\n'),
    ),
  });
  const review = page.getByRole('button', { name: 'Review support-developer.txt', exact: true });
  const row = page.locator('tr').filter({ has: review });
  await row.getByText('Needs review', { exact: true }).waitFor({ timeout: 30000 });

  const documents = await (await context.request.get(`${base}/api/documents`)).json();
  const saved = documents.documents.find((document) => document.name === 'support-developer.txt');
  if (saved?.profile !== 'job_description' || saved?.extraction?.documentType !== 'job_description')
    throw new Error('Selected extraction route was not applied.');
  if (saved.extraction.sections.length !== 5)
    throw new Error(`Expected five job sections, received ${saved.extraction.sections.length}.`);

  await review.click();
  const dialog = page.getByRole('dialog', { name: 'support-developer.txt' });
  await dialog.waitFor();
  await page.getByRole('button', { name: 'Sections (5)', exact: true }).waitFor();
  await page
    .getByRole('textbox', { name: 'Document title' })
    .inputValue()
    .then((value) => {
      if (value !== 'Full Stack Support Developer') throw new Error(`Unexpected title: ${value}`);
    });
  await page.screenshot({
    path: path.resolve('artifacts/beta-job-description.png'),
    fullPage: true,
  });
  if (failures.length) throw new Error(failures.join('\n'));
  console.log(
    'Beta browser smoke passed: spatial dashboard and routed job-description extraction.',
  );
} finally {
  await context.close();
  await browser.close();
}
