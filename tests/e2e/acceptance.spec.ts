/** PRD section 7: one test per acceptance criterion, named by requirement ID. */
import { expect, test, type Page } from '@playwright/test';

const row = (page: Page, id: string) => page.locator(`tr[data-member="${id}"]`);
const dialog = (page: Page) => page.locator('dialog[open]');
const addHours = async (page: Page, n: number) => {
  for (let i = 0; i < n; i += 1) await page.getByRole('button', { name: '+1 h' }).click();
};

/** Runs a consented call to the end and logs it as reached. */
const completeCall = async (page: Page) => {
  await page.getByLabel('Recorded consent for live transcript').check();
  await page.getByRole('button', { name: /^Call$/ }).click();
  await page.getByRole('button', { name: 'Skip to end of demo call' }).click();
  await page.getByRole('button', { name: /End call/ }).click();
  await dialog(page).getByLabel(/^Reached/).check();
  await dialog(page).getByRole('button', { name: 'Log outcome' }).click();
};

const resolveInDialog = async (page: Page, optionIndex = 0) => {
  await dialog(page).getByRole('radio').nth(optionIndex).check();
  await dialog(page).getByLabel('Reason (required)').fill('Confirmed with daughter on the call');
  await dialog(page).getByRole('button', { name: 'Resolve and log' }).click();
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
  await page.goto('/#/queue');
  await page.reload();
});

test('Q1, Q4: queue ranks 90, 82, 71, 63, 60 and the breakdown matches the annex', async ({ page }) => {
  await expect(page.locator('tr.qrow .ring')).toHaveText(['90', '82', '71', '63', '60']);
  await expect(page.locator('tr.qrow .member-link')).toHaveText([
    'Harold Mensah, 78', 'Carmen Ortiz, 81', 'Dwayne Carter, 52', 'Tamika Brooks, 34', 'Priya Nair, 66',
  ]);
  await row(page, 'P1').locator('.ring').click();
  const cells = await dialog(page).locator('tbody tr').evaluateAll((trs) =>
    trs.map((tr) => [...tr.querySelectorAll('td')].map((td) => td.textContent)));
  expect(cells).toEqual([['35', '1.00', '35.00'], ['30', '1.00', '30.00'], ['20', '0.85', '17.00'], ['15', '0.50', '7.50']]);
  await expect(dialog(page).locator('tfoot')).toContainText('89.50');
});

test('Q2: filters narrow the queue', async ({ page }) => {
  const counts: [string, number][] = [['Discharges', 2], ['Due today', 2], ['Unreachable', 2], ['Needs review', 3], ['All', 5]];
  for (const [name, n] of counts) {
    await page.getByRole('button', { name: new RegExp(`^${name} \\(${n}\\)`) }).click();
    await expect(page.locator('tr.qrow')).toHaveCount(n);
  }
});

test('Q3: a new arrival moves the capacity bar; over 100% warns', async ({ page }) => {
  await expect(page.getByTestId('capacity-title')).toHaveText('Today: 14 tasks · about 6.5 h of 7.5 h');
  await expect(page.getByTestId('capacity-note')).toHaveText('87% of capacity');
  const add = page.getByRole('button', { name: 'Simulate new discharge alert' });
  await add.click();
  await expect(page.getByTestId('capacity-title')).toHaveText('Today: 15 tasks · about 7.3 h of 7.5 h');
  await expect(page.locator('tr.qrow')).toHaveCount(6);
  await add.click();
  await expect(page.getByTestId('capacity-note')).toContainText('Over capacity');
  await expect(page.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '100');
});

test('Q5: Harold reads "due 5 pm today" and turns red under 4 hours', async ({ page }) => {
  const clock = page.getByTestId('clock-P1');
  await expect(clock).toContainText('Contact due 5 pm today');
  await expect(clock).not.toHaveClass(/clock-red/);
  await addHours(page, 5); // 1 pm: exactly 4 hours left
  await expect(clock).not.toHaveClass(/clock-red/);
  await addHours(page, 1); // 2 pm: 3 hours left
  await expect(clock).toHaveClass(/clock-red/);
  await expect(clock).toContainText('due 5 pm today');
});

test('Q6: snooze is blocked without a reason; with one it moves the row and logs', async ({ page }) => {
  await row(page, 'P1').getByRole('button', { name: 'Snooze or override' }).click();
  await dialog(page).getByRole('button', { name: 'Apply and log' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('Choose a reason');
  await expect(dialog(page)).toBeVisible();

  await dialog(page).getByLabel('Reason (required)').selectOption('Member asked to be called later');
  await dialog(page).getByRole('button', { name: 'Apply and log' }).click();
  await expect(page.locator('tr.qrow').last()).toHaveAttribute('data-member', 'P1');
  await expect(page.getByTestId('capacity-title')).toHaveText('Today: 13 tasks · about 5.5 h of 7.5 h');

  await page.getByRole('link', { name: 'Audit' }).click();
  const table = page.getByTestId('audit-table');
  await expect(table).toContainText('Override: snoozed');
  await expect(table).toContainText('Member asked to be called later');
});

test('Q6: moving a case to the top pins it above the ranking', async ({ page }) => {
  await row(page, 'P2').getByRole('button', { name: 'Snooze or override' }).click();
  await dialog(page).getByLabel(/^Move to top/).check();
  await dialog(page).getByLabel('Reason (required)').selectOption({ index: 1 });
  await dialog(page).getByRole('button', { name: 'Apply and log' }).click();
  await expect(page.locator('tr.qrow').first()).toHaveAttribute('data-member', 'P2');
});

test('Q7, Q8: risk chips and the new-since-last-touch line', async ({ page }) => {
  await expect(row(page, 'P4')).toContainText('Dup ID');
  await expect(row(page, 'P3')).toContainText('Phone: Low');
  await expect(row(page, 'P1')).toContainText('New since your last touch');
  await row(page, 'P1').getByRole('link').click();
  await page.getByRole('link', { name: 'Queue', exact: true }).first().click();
  await expect(row(page, 'P1')).not.toContainText('New since your last touch');
});

test('M1, M2, M3, M6, M7: Member 360 above the fold', async ({ page }) => {
  await page.goto('/#/member/P1');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Harold Mensah');
  const ribbon = page.locator('.ribbon');
  for (const t of ['78 M', 'MA-HMO', 'Transitions of Care', 'English', 'M-20011', 'Dr. A. Rao', 'Contact due 5 pm today', 'Visit by Thu 12 Nov']) {
    await expect(ribbon).toContainText(t);
  }
  await expect(page.locator('.brief li')).toHaveCount(3);
  await expect(page.locator('.brief li').first()).toContainText('[ADT]');
  await expect(page.locator('.risk')).toHaveCount(3);
  await expect(page.locator('.risk .chip').nth(2)).toHaveText('Claim 45 d');
  await expect(page.getByText('DRAFT').first()).toBeVisible();
  await page.getByRole('button', { name: 'Confirm brief' }).click();
  await expect(page.getByRole('button', { name: 'Return to draft' })).toBeVisible();
  await expect(page.locator('.card-accent')).toContainText('Grace (daughter)');
  await expect(page.getByText('Re-screen on this call')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'PCP visit by Thu 12 Nov' })).toBeVisible();
});

test('M1: Tamika warns of a duplicate and blocks outreach until reviewed', async ({ page }) => {
  await page.goto('/#/member/P4/call');
  await expect(page.getByRole('alert')).toContainText('Possible duplicate record');
  await expect(page.getByRole('button', { name: /^Call$/ })).toBeDisabled();
  await page.getByRole('button', { name: 'Review records' }).click();
  await dialog(page).getByRole('button', { name: 'Confirm decision' }).click();
  await expect(dialog(page).getByRole('alert')).toBeVisible();
  await dialog(page).getByLabel('Not a duplicate').check();
  await dialog(page).getByLabel('Reason (required)').fill('Different SSN on file');
  await dialog(page).getByRole('button', { name: 'Confirm decision' }).click();
  await expect(page.getByRole('button', { name: /^Call$/ })).toBeEnabled();
});

test('M4: furosemide conflict shows both sources; Resolve needs a reason and is logged', async ({ page }) => {
  await page.goto('/#/member/P1');
  const furosemide = page.locator('tr[data-drug="Furosemide"]');
  await expect(furosemide).toContainText('40 mg daily');
  await expect(furosemide).toContainText('20 mg');
  await expect(furosemide).toContainText('last fill 14 Sep');
  await expect(furosemide).toContainText('Conflict');

  await furosemide.getByRole('button', { name: 'Resolve Furosemide' }).click();
  await dialog(page).getByRole('radio').first().check();
  await dialog(page).getByRole('button', { name: 'Resolve and log' }).click();
  await expect(dialog(page).getByRole('alert')).toContainText('State a reason');
  await expect(dialog(page)).toBeVisible();

  await dialog(page).getByLabel('Reason (required)').fill('Bottle read back by daughter');
  await dialog(page).getByRole('button', { name: 'Resolve and log' }).click();
  await expect(furosemide).toContainText('Bottle read back by daughter');
  await page.goto('/#/audit');
  await expect(page.getByTestId('audit-table')).toContainText('Resolved medication: Furosemide');
});

test('M4: a gap is labeled probable, never non-adherent', async ({ page }) => {
  await page.goto('/#/member/P2');
  await expect(page.locator('tr[data-drug="Metformin"]')).toContainText('probable gap 36 d');
  await expect(page.locator('tr[data-drug="Glargine"]')).toContainText('probable gap 25 d');
  await expect(page.locator('body')).not.toContainText(/non-adherent as|is non-adherent/i);
});

test('M5: the claims blind spot reads 45 days as of 9 Nov 2026', async ({ page }) => {
  await page.goto('/#/member/P1');
  await expect(page.getByTestId('blind-spot')).toHaveText('Claims blind spot: last claim 25 Sep, 45 days old');
});

test('M8: raw records open in a drawer, and a citation opens its source', async ({ page }) => {
  await page.goto('/#/member/P1');
  await page.getByRole('button', { name: 'Raw claims, notes, labs' }).click();
  await expect(dialog(page)).toContainText('Outpatient cardiology visit 25 Sep');
  await dialog(page).getByRole('button', { name: 'Close' }).click();
  await page.getByRole('button', { name: 'Open source record: Contact log' }).first().click();
  await expect(dialog(page)).toContainText('daughter Grace answered');
  await expect(dialog(page)).not.toContainText('cardiology');
});

test('O1: best number first, with confidence and last-verified date', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Call Grace (daughter) · (555) 0114 · mobile');
  await expect(page.locator('.number.is-on')).toContainText('Last verified 3 Nov');
  await expect(page.locator('.number.is-on')).toContainText('Confidence: High');
  await expect(page.locator('.number').nth(1)).toContainText('Confidence: Low');
});

test('O3: Harold shows 27 prefilled, 9 to ask, 4 conflicts; each prefilled field cites a source', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  const counts = page.getByTestId('assess-counts');
  await expect(counts).toContainText('27 prefilled');
  await expect(counts).toContainText('9 to ask');
  await expect(counts).toContainText('4 conflicts');
  await expect(page.locator('.afield')).toHaveCount(40);
  const prefilled = page.locator('.afield[data-status="prefilled"]');
  await expect(prefilled).toHaveCount(27);
  await expect(prefilled.locator('.chip')).toHaveCount(27);
});

test('O8: no consent means dictation, and no transcript', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await expect(page.getByTestId('transcript')).toHaveCount(0);
  await expect(page.getByLabel('Dictation')).toBeVisible();
  await expect(page.locator('[data-sentence="P1-S1"]')).toContainText('Needs dictation');
  await page.getByLabel('Dictation').fill('Grace says he missed doses since Thursday.');
  await expect(page.locator('[data-sentence="P1-S1"] textarea')).toHaveValue('Grace says he missed doses since Thursday.');
  await expect(page.locator('[data-sentence="P1-S1"]')).toContainText('[dictation]');
  await expect(page.getByTestId('edit-rate')).toHaveText('0%');
});

test('O2, O8: with consent the transcript plays and feeds the note', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await expect(page.locator('.checklist')).toContainText('Furosemide filled? Dose on the bottle?');
  await completeCall(page);
  await expect(page.getByTestId('transcript')).toContainText('The pharmacy was closed over the weekend');
  await expect(page.locator('[data-sentence="P1-S1"] textarea')).toHaveValue(/not taken furosemide/);
  await page.getByRole('button', { name: 'Go to transcript 03:12' }).first().click();
  await expect(page.locator('.transcript .is-hit')).toContainText('03:12');
  await expect(page.locator('.attempts')).toContainText('Reached');
  await page.goto('/#/queue');
  await expect(page.getByTestId('clock-P1')).toContainText('Contact made');
});

test('O4, O6: nothing is written until Sign; signing logs the note, plan and tasks', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await page.getByRole('button', { name: 'Approve & sign' }).click();
  await expect(page.getByRole('alert')).toContainText('Not ready to sign');
  await expect(page.getByTestId('signed-banner')).toHaveCount(0);

  await completeCall(page);
  await page.getByRole('button', { name: 'Resolve Medication list reconciled' }).click();
  await resolveInDialog(page);
  await page.getByRole('button', { name: 'Resolve Medication list reconciled' }).click();
  await resolveInDialog(page);
  for (const f of ['Fill gaps', 'Transport', 'Phone verified']) {
    await page.getByRole('button', { name: `Resolve ${f}` }).click();
    await resolveInDialog(page);
  }
  await expect(page.getByTestId('assess-counts')).toContainText('0 conflicts');

  await page.goto('/#/audit');
  await expect(page.getByTestId('audit-table')).not.toContainText('Signed call note');
  await page.goto('/#/member/P1/call');

  await page.getByLabel('I reviewed this draft').check();
  await page.getByRole('button', { name: 'Approve & sign' }).click();
  await expect(dialog(page)).toContainText('still unanswered');
  await dialog(page).getByText('4', { exact: true }).click();
  await dialog(page).getByRole('button', { name: 'Sign and write to record' }).click();
  await expect(page.getByTestId('signed-banner')).toContainText('written to the record');
  await expect(page.locator('[data-sentence="P1-O1"] textarea')).toBeDisabled();

  await page.goto('/#/audit');
  const table = page.getByTestId('audit-table');
  for (const t of ['Signed call note', 'Signed care plan', 'Audit form generated', '3 tasks created']) {
    await expect(table).toContainText(t);
  }
  await page.goto('/#/queue');
  await expect(page.locator('tr.qrow').nth(3)).toBeVisible();
  await expect(row(page, 'P1')).toContainText('Signed');
  await expect(page.getByTestId('capacity-title')).toHaveText('Today: 13 tasks · about 5.5 h of 7.5 h');
  await page.goto('/#/reports');
  await expect(page.locator('.stat', { hasText: 'Trust score' })).toContainText('4.0 of 5');
});

test('O5: the care plan stays DRAFT until signed', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await expect(page.locator('section', { hasText: 'Care-plan draft' }).first()).toContainText('DRAFT');
});

test('O7: editing a draft sentence changes the edit rate', async ({ page }) => {
  await page.goto('/#/member/P1/call');
  await expect(page.getByTestId('edit-rate')).toHaveText('0%');
  await page.locator('[data-sentence="P1-O1"] textarea').fill('No furosemide fill since 14 Sep; bottle reads 20 mg.');
  await expect(page.getByTestId('edit-rate')).toHaveText('8%');
  await page.getByLabel('Goal: care plan item').first().fill('Furosemide in hand today');
  await expect(page.getByTestId('edit-rate')).toHaveText('17%');
});

test('Outreach: a wrong number lowers confidence and does not count as contact', async ({ page }) => {
  await page.goto('/#/member/P3/call');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('ED social worker');
  await page.locator('.number').nth(1).click();
  await page.getByRole('button', { name: /^Call$/ }).click();
  await page.getByRole('button', { name: /End call/ }).click();
  await dialog(page).getByLabel(/^Wrong number/).check();
  await dialog(page).getByRole('button', { name: 'Log outcome' }).click();
  await expect(page.locator('.number').nth(1)).toContainText('Confidence: None');
  await expect(page.locator('.attempts')).toContainText('Wrong number');
  await page.getByRole('button', { name: 'Approve & sign' }).click();
  await expect(page.getByRole('alert')).toContainText('Log a reached call first');
});

test('Unknown stays unknown for a new arrival', async ({ page }) => {
  await page.getByRole('button', { name: 'Simulate new discharge alert' }).click();
  await page.getByRole('link', { name: /Walter Bishop/ }).click();
  await expect(page.getByTestId('blind-spot')).toHaveText('Claims: none received yet, shown as unknown');
  await expect(page.getByText('No medication source has arrived yet. Shown as unknown, not as none.')).toBeVisible();
  await expect(page.locator('.risk .chip').nth(1)).toHaveText('Pharm unknown');
  await expect(page.locator('.ribbon')).toContainText('Contact due Thu 12 Nov'); // Veterans Day is skipped
});

test('Kill switch: turning note drafting off falls back to a manual note, and is logged', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByRole('switch', { name: /Call note drafting/ }).uncheck();
  await page.goto('/#/member/P1/call');
  await expect(page.getByText('Note drafting is switched off')).toBeVisible();
  await expect(page.getByRole('textbox', { name: 'Call note' })).toBeVisible();
  await page.goto('/#/audit');
  await expect(page.getByTestId('audit-table')).toContainText('AI kill switch: Call note drafting off');
});

test('Settings: weights re-rank the queue; degraded mode shows an as-of stamp', async ({ page }) => {
  await page.goto('/#/settings');
  await page.getByLabel('Reach').fill('60');
  await page.getByRole('switch', { name: /Degraded mode/ }).check();
  await page.goto('/#/queue');
  await expect(page.getByRole('status').filter({ hasText: 'Degraded mode' })).toContainText('last-known data as of');
  await expect(page.locator('tr.qrow').first()).toHaveAttribute('data-member', 'P5');
});

test('State survives a refresh; audit logs PHI views', async ({ page }) => {
  await page.goto('/#/member/P1');
  await page.getByRole('button', { name: 'Confirm brief' }).click();
  await page.reload();
  await expect(page.getByRole('button', { name: 'Return to draft' })).toBeVisible();
  await page.goto('/#/audit');
  await expect(page.getByTestId('audit-table')).toContainText('Viewed Member 360');
});

test('Reset clears everything back to 8 am', async ({ page }) => {
  await addHours(page, 2);
  await page.getByRole('button', { name: 'Reset demo' }).click();
  await dialog(page).getByRole('button', { name: 'Reset demo' }).click();
  await expect(page.getByTestId('demo-clock')).toContainText('Mon 9 Nov, 8 am');
});
