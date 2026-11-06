/** Non-functional checks: WCAG 2.1 AA, keyboard, layout, typography, performance. */
import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';

const PAGES = [
  '#/queue', '#/members', '#/reports', '#/audit', '#/settings',
  '#/member/P1', '#/member/P3', '#/member/P4', '#/member/P1/call', '#/member/P4/call',
];

for (const path of PAGES) {
  test(`axe WCAG 2.1 AA: ${path}`, async ({ page }) => {
    await page.goto(`/${path}`);
    await page.locator('h1').first().waitFor();
    const { violations } = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
    const summary = violations.flatMap((v) => v.nodes.map((n) => `${v.id}: ${n.target.join(' ')} ${n.failureSummary ?? ''}`));
    expect(summary).toEqual([]);
  });
}

test('axe: dialogs pass too', async ({ page }) => {
  await page.goto('/#/queue');
  await page.locator('tr[data-member="P1"] .ring').click();
  await page.locator('dialog[open]').waitFor();
  const a = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(a.violations.map((v) => v.id)).toEqual([]);
});

test('Montserrat is the rendered font, loaded locally', async ({ page }) => {
  const external: string[] = [];
  page.on('request', (r) => {
    if (!r.url().startsWith('http://localhost') && !r.url().startsWith('data:')) external.push(r.url());
  });
  await page.goto('/#/queue');
  await page.locator('h1').first().waitFor();
  await page.evaluate(() => document.fonts.ready);
  const font = await page.evaluate(() => ({
    family: getComputedStyle(document.body).fontFamily,
    loaded: document.fonts.check('600 14px "Montserrat Variable"'),
  }));
  expect(font.family).toContain('Montserrat');
  expect(font.loaded).toBe(true);
  expect(external).toEqual([]);
});

test('Tabular numerals: digits share one width', async ({ page }) => {
  await page.goto('/#/queue');
  await page.evaluate(() => document.fonts.ready);
  const widths = await page.evaluate(() => {
    const el = document.createElement('span');
    el.className = 'tnum';
    el.style.cssText = 'position:absolute;font-size:40px';
    document.body.append(el);
    const w = ['1111', '0000', '8888'].map((t) => { el.textContent = t; return el.getBoundingClientRect().width; });
    el.remove();
    return w;
  });
  expect(Math.max(...widths) - Math.min(...widths)).toBeLessThan(0.5);
});

test('The page is light-only even when the OS prefers dark', async ({ browser }) => {
  const context = await browser.newContext({ colorScheme: 'dark', baseURL: 'http://localhost:5199' });
  const page = await context.newPage();
  await page.goto('/#/queue');
  const color = await page.evaluate(() => getComputedStyle(document.body).color);
  expect(color).toBe('rgb(18, 41, 107)');
  await context.close();
});

for (const width of [1920, 1280, 1024, 768, 390]) {
  test(`No horizontal page scroll at ${width}px`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    for (const path of PAGES) {
      await page.goto(`/${path}`);
      await page.locator('h1').first().waitFor();
      const over = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      expect(over, `${path} at ${width}`).toBeLessThanOrEqual(0);
    }
  });
}

test('Keyboard: skip link, focus moves to the new heading, Esc closes a dialog and restores focus', async ({ page }) => {
  await page.goto('/#/queue');
  await page.keyboard.press('Tab');
  await expect(page.getByRole('link', { name: 'Skip to main content' })).toBeFocused();

  const ring = page.locator('tr[data-member="P1"] .ring');
  await ring.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('dialog[open]')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(ring).toBeFocused();

  await page.locator('tr[data-member="P1"] .member-link').focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('h1')).toBeFocused();
  await expect(page).toHaveTitle('Harold Mensah: Member 360 · HiCase');
});

test('Reduced motion is respected', async ({ browser }) => {
  const context = await browser.newContext({ reducedMotion: 'reduce', baseURL: 'http://localhost:5199' });
  const page = await context.newPage();
  await page.goto('/#/queue');
  const t = await page.locator('.nav a').first().evaluate((el) => getComputedStyle(el).transitionDuration);
  expect(t).toBe('0s');
  await context.close();
});

test('Latency: queue under 2 s and Member 360 under 1.5 s', async ({ page }) => {
  await page.goto('/#/queue');
  await page.locator('tr.qrow').first().waitFor();
  const start = Date.now();
  await page.locator('tr[data-member="P1"] .member-link').click();
  await page.locator('.ribbon').waitFor();
  expect(Date.now() - start).toBeLessThan(1500);
  const t0 = Date.now();
  await page.reload();
  await page.locator('tr.qrow, .ribbon').first().waitFor();
  expect(Date.now() - t0).toBeLessThan(2000);
});

test('Unknown routes and members fail gracefully', async ({ page }) => {
  await page.goto('/#/member/NOPE');
  await expect(page.locator('h1')).toHaveText('Member not found');
  await page.goto('/#/nowhere');
  await expect(page.locator('h1')).toHaveText('Page not found');
});

test('No console errors across the app', async ({ page }) => {
  const errors: string[] = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(e.message));
  for (const path of PAGES) {
    await page.goto(`/${path}`);
    await page.locator('h1').first().waitFor();
  }
  expect(errors).toEqual([]);
});
