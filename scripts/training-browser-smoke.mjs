import { chromium } from 'playwright';
import sharp from 'sharp';
const browser = await chromium.launch({
  headless: true,
  ...(process.env.BROWSER_EXECUTABLE ? { executablePath: process.env.BROWSER_EXECUTABLE } : {}),
});
const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
async function image(text) {
  return sharp(
    Buffer.from(
      `<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="130"><rect width="100%" height="100%" fill="white"/><text x="20" y="85" font-family="Nirmala UI,Arial,sans-serif" font-size="54" fill="black">${text}</text></svg>`,
    ),
  )
    .png()
    .toBuffer();
}
try {
  await page.goto('http://localhost:4000');
  await page.getByRole('button', { name: 'Create an account', exact: true }).click();
  await page.getByLabel('Your name').fill('Training test account');
  await page.getByLabel('Email address').fill(`training-${Date.now()}@example.com`);
  await page.getByLabel('Password', { exact: true }).fill('synthetic-training-password');
  await page.getByRole('button', { name: 'Create account', exact: true }).click();
  await page.getByRole('button', { name: 'Training lab', exact: true }).click();
  await page.getByRole('heading', { name: '2. Add an exact text-line label' }).waitFor();
  const english = [
    'Invoice total: 100',
    'Order number 1042',
    'Payment received',
    'Date 13 October 2026',
    'Thank you for your purchase',
  ];
  const hindi = [
    'नमस्ते भारत',
    'चालान संख्या १०४२',
    'कुल राशि १०० रुपये',
    'भुगतान प्राप्त हुआ',
    'आपका धन्यवाद',
  ];
  await page
    .getByLabel('Cropped line image')
    .setInputFiles({ name: 'line.png', mimeType: 'image/png', buffer: await image(english[0]) });
  await page.getByLabel('Exact text in the image').fill(english[0]);
  await page.locator('.training-form select[name="split"]').selectOption('test');
  await page.getByLabel('Source document group').fill('browser-eng-0');
  await page.getByLabel('I checked that this transcription matches the image exactly.').check();
  await page.getByRole('button', { name: 'Save labelled line' }).click();
  await page.waitForFunction(() =>
    Array.from(document.querySelectorAll('.training-sample small')).some((s) =>
      s.textContent?.includes('browser-eng-0'),
    ),
  );
  for (const [language, lines] of [
    ['eng', english.slice(1)],
    ['hin', hindi],
  ])
    for (const [i, text] of lines.entries()) {
      const response = await context.request.post('http://localhost:4000/api/training/samples', {
        multipart: {
          language,
          sourceGroup: `browser-${language}-${language === 'eng' ? i + 1 : i}`,
          split: 'test',
          text,
          approved: 'true',
          image: { name: 'line.png', mimeType: 'image/png', buffer: await image(text) },
        },
      });
      if (response.status() !== 201) throw new Error(await response.text());
    }
  await page.waitForFunction(
    () =>
      Array.from(document.querySelectorAll('button')).find((b) =>
        b.textContent?.includes('Measure baseline'),
      )?.disabled === false,
  );
  await page.getByRole('button', { name: 'Measure baseline', exact: true }).click();
  await page.getByText('Baseline measured', { exact: true }).waitFor({ timeout: 90000 });
  await page.getByRole('combobox', { name: 'Training language' }).selectOption('hin');
  await page.getByRole('button', { name: 'Measure baseline', exact: true }).click();
  await page.getByText('Baseline measured', { exact: true }).waitFor({ timeout: 90000 });
  await page.getByRole('heading', { name: 'Run report · completed' }).waitFor();
  if (await page.getByRole('button', { name: 'Train and test locally', exact: true }).isEnabled())
    throw new Error(
      'Training button should stay disabled without training/validation data and native tools.',
    );
  const dismiss = page.getByRole('button', { name: 'Dismiss notification' });
  if (await dismiss.count()) await dismiss.click();
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.waitForTimeout(150);
  await page.screenshot({ path: 'artifacts/training-lab.png', fullPage: true });
  const response = await context.request.get('http://localhost:4000/api/training');
  const lab = await response.json();
  if (
    lab.runs.length !== 2 ||
    lab.runs.some((r) => r.status !== 'completed' || r.baseline.lines !== 5)
  )
    throw new Error('Baseline run reports missing.');
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(
    'Training browser smoke passed: permanent local account, approved label upload, English/Hindi baseline runs, real metrics, experiment history and prerequisite guard. No model trained or released.',
  );
} finally {
  await context.close();
  await browser.close();
}
