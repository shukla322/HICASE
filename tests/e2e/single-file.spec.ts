/** The double-click deliverable: the single HTML file, opened from disk with the network off. */
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { expect, test } from '@playwright/test';

const file = resolve('dist-single/index.html');

test.skip(!existsSync(file), 'run npm run build:single first');

test('works from disk, offline, with Montserrat embedded', async ({ page, context }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await context.setOffline(true);
  await page.goto(`${pathToFileURL(file).href}#/queue`);
  await expect(page.locator('tr.qrow .ring')).toHaveText(['90', '82', '71', '63', '60']);
  await page.evaluate(() => document.fonts.ready);
  expect(await page.evaluate(() => document.fonts.check('600 14px "Montserrat Variable"'))).toBe(true);

  await page.locator('tr[data-member="P1"] .member-link').click();
  await expect(page.getByTestId('blind-spot')).toContainText('45 days old');
  await page.reload();
  await expect(page.locator('.ribbon')).toContainText('Harold Mensah');
  expect(errors).toEqual([]);
});
