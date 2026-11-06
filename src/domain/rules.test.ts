import { describe, expect, it } from 'vitest';
import { ALL_FIELDS } from '../data/assessment';
import { ARRIVAL_COUNT, buildArrival } from '../data/arrivals';
import { PATIENTS } from '../data/patients';
import { initialCase } from '../state/reducer';
import { assessmentCounts, assessmentViews } from './assessment';
import { addBusinessDays, ageDays, AS_OF, fmtDay, fmtTime, parseDate } from './dates';
import {
  capacity, clockView, DEFAULT_WEIGHTS, editRate, fmtAge, freshness, isUnreachable, matchesFilter,
  rankCandidates, score, sentencePending, sortQueue, supplyEnd, supplyGapDays, tcmClock,
} from './rules';
import type { CaseState, Patient } from './types';

const byId = (id: string): Patient => PATIENTS.find((p) => p.id === id)!;
const harold = byId('P1');
const blankCases = (list = PATIENTS): Record<string, CaseState> =>
  Object.fromEntries(list.map((p) => [p.id, initialCase()]));

describe('queue score (annex Queue_Score sheet)', () => {
  it.each([['P1', 90], ['P5', 82], ['P3', 71], ['P4', 63], ['P2', 60]])('%s scores %i', (id, want) => {
    expect(score(byId(id).signals, DEFAULT_WEIGHTS)).toBe(want);
  });

  it('weights total 100', () => {
    expect(Object.values(DEFAULT_WEIGHTS).reduce((a, b) => a + b)).toBe(100);
  });

  it('ranks the five patients in annex order', () => {
    const order = sortQueue(PATIENTS, blankCases(), DEFAULT_WEIGHTS).map((p) => p.name.split(' ')[0]);
    expect(order).toEqual(['Harold', 'Carmen', 'Dwayne', 'Tamika', 'Priya']);
  });

  it('moves snoozed cases below everything and pinned cases above', () => {
    const cases = blankCases();
    cases.P1.override = { kind: 'snooze', reason: 'x' };
    cases.P2.override = { kind: 'top', reason: 'x' };
    const order = sortQueue(PATIENTS, cases, DEFAULT_WEIGHTS).map((p) => p.id);
    expect(order[0]).toBe('P2');
    expect(order.at(-1)).toBe('P1');
  });
});

describe('freshness', () => {
  it('applies the green, amber and red bands', () => {
    expect([0, 2, 3, 14, 15, null].map(freshness)).toEqual(['green', 'green', 'amber', 'amber', 'red', 'red']);
  });

  it('formats ages like the deck', () => {
    expect(fmtAge(45)).toBe('45 d');
    expect(fmtAge(ageDays('2026-02-09', AS_OF))).toBe('9 mo');
    expect(fmtAge(ageDays('2025-12-15', AS_OF))).toBe('11 mo');
    expect(fmtAge(null)).toBe('unknown');
  });

  it('M5: last claim is 45 days old on 9 Nov 2026', () => {
    expect(ageDays(harold.lastClaim!, AS_OF)).toBe(45);
    expect(ageDays(byId('P3').lastClaim!, AS_OF)).toBe(52);
  });
});

describe('supply gap (annex Pharmacy_Fills sheet)', () => {
  it.each([
    ['Metformin 1000 mg', '2026-09-04', 36],
    ['Glargine', '2026-09-15', 25],
    ['Olanzapine 10 mg', '2026-09-18', 22],
    ['Lisinopril 10 mg', '2026-10-03', 7],
    ['Furosemide 20 mg', '2026-09-14', 26],
  ])('%s', (drug, date, gap) => {
    expect(supplyGapDays({ drug, date, daysSupply: 30 }, AS_OF)).toBe(gap);
  });

  it('floors at zero while supply lasts', () => {
    expect(supplyGapDays({ drug: 'Carvedilol', date: '2026-10-28', daysSupply: 30 }, AS_OF)).toBe(0);
  });

  it('computes supply end as fill date plus days supply', () => {
    expect(fmtDay(supplyEnd({ drug: 'x', date: '2026-10-03', daysSupply: 30 }))).toBe('Mon 2 Nov');
  });
});

describe('clocks', () => {
  it('Harold: 2 business days from Thu 5 Nov is Mon 9 Nov, 5 pm; visit by Thu 12 Nov', () => {
    const { contactDue, visitDue } = tcmClock(harold.discharge!);
    expect(fmtDay(contactDue)).toBe('Mon 9 Nov');
    expect(fmtTime(contactDue)).toBe('5 pm');
    expect(fmtDay(visitDue)).toBe('Thu 12 Nov');
  });

  it('Carmen: contact Tue 10 Nov; 14-day visit Fri 20 Nov', () => {
    const { contactDue, visitDue } = tcmClock(byId('P5').discharge!);
    expect(fmtDay(contactDue)).toBe('Tue 10 Nov');
    expect(fmtDay(visitDue)).toBe('Fri 20 Nov');
  });

  it('skips Veterans Day when counting business days', () => {
    expect(fmtDay(addBusinessDays(parseDate('2026-11-09'), 2))).toBe('Thu 12 Nov');
  });

  it('Q5: reads "due 5 pm today" and turns red only under 4 hours', () => {
    const at = (h: number, m = 0) => new Date(2026, 10, 9, h, m);
    expect(clockView(harold, initialCase(), at(8)).label).toBe('Contact due 5 pm today');
    expect(clockView(harold, initialCase(), at(8)).tone).toBe('amber');
    expect(clockView(harold, initialCase(), at(13)).tone).toBe('amber');
    expect(clockView(harold, initialCase(), at(13, 1)).tone).toBe('red');
    expect(clockView(harold, initialCase(), at(18)).label).toContain('overdue');
  });

  it('shows contact made once a call reaches someone', () => {
    const c = initialCase();
    c.attempts.push({ at: new Date(2026, 10, 9, 9, 30).getTime(), phoneId: 'grace', outcome: 'Reached', seconds: 200 });
    const v = clockView(harold, c, AS_OF);
    expect(v.tone).toBe('done');
    expect(v.label).toBe('Contact made 9:30 am');
  });
});

describe('capacity', () => {
  it('matches the deck: 14 tasks, 6.5 h, 87%', () => {
    expect(capacity(PATIENTS, blankCases())).toEqual({ tasks: 14, hours: 6.5, pct: 87, over: false });
  });

  it('Q3: new arrivals raise it and can exceed 100%', () => {
    const arrivals = Array.from({ length: ARRIVAL_COUNT }, (_, i) => buildArrival(i, AS_OF.getTime()));
    const all = [...PATIENTS, ...arrivals];
    const cap = capacity(all, blankCases(all));
    expect(cap.tasks).toBe(17);
    expect(cap.over).toBe(true);
  });

  it('a snoozed case leaves capacity', () => {
    const cases = blankCases();
    cases.P1.override = { kind: 'snooze', reason: 'x' };
    expect(capacity(PATIENTS, cases).hours).toBeCloseTo(5.5);
  });
});

describe('assessment', () => {
  it('has 40 fields', () => {
    expect(ALL_FIELDS).toHaveLength(40);
    expect(new Set(ALL_FIELDS.map((f) => f.name)).size).toBe(40);
  });

  it('O3: Harold shows 27 prefilled, 9 to ask, 4 conflicts', () => {
    expect(assessmentCounts(harold, initialCase(), true)).toEqual({ prefilled: 27, ask: 9, conflict: 4, settled: 0 });
  });

  it('O3: every prefilled field cites a feed that exists for that member', () => {
    for (const p of PATIENTS) {
      for (const v of assessmentViews(p, initialCase(), true)) {
        if (v.status === 'prefilled') expect(p.feeds[v.feed], `${p.name}: ${v.name}`).toBeTruthy();
      }
    }
  });

  it('never prefills allergies for a member with no CCD', () => {
    for (const id of ['P2', 'P3', 'P4']) {
      const v = assessmentViews(byId(id), initialCase(), true).find((f) => f.name === 'Allergies');
      expect(v?.status).toBe('ask');
    }
  });

  it('a new arrival has almost nothing prefilled', () => {
    const counts = assessmentCounts(buildArrival(0, AS_OF.getTime()), initialCase(), true);
    expect(counts.prefilled).toBe(1);
    expect(counts.ask).toBe(39);
  });

  it('kill switch: with prefill off nothing is prefilled', () => {
    expect(assessmentCounts(harold, initialCase(), false).prefilled).toBe(0);
  });
});

describe('medication candidates', () => {
  it('ranks the CCD above the old fill for furosemide, without resolving it', () => {
    const med = harold.meds[0];
    const ranked = rankCandidates(med, AS_OF);
    expect(ranked.map((c) => c.source)).toEqual(['ccd', 'pharm']);
    expect(ranked[0].value).toBe('40 mg daily');
    expect(med.status).toBe('conflict');
  });
});

describe('filters', () => {
  const names = (f: Parameters<typeof matchesFilter>[0]) =>
    PATIENTS.filter((p) => matchesFilter(f, p, initialCase(), AS_OF)).map((p) => p.id).sort();

  it('Discharges', () => expect(names('discharges')).toEqual(['P1', 'P5']));
  it('Due today', () => expect(names('due')).toEqual(['P1', 'P4']));
  it('Unreachable', () => expect(names('unreachable')).toEqual(['P3', 'P4']));
  it('Needs review', () => expect(names('review')).toEqual(['P1', 'P2', 'P4']));

  it('a caregiver number keeps Harold reachable', () => {
    expect(isUnreachable(harold)).toBe(false);
  });
});

describe('AI guardrails on drafts', () => {
  const all = [...PATIENTS, buildArrival(0, AS_OF.getTime())];

  it('every brief, note and care-plan sentence carries a citation', () => {
    for (const p of all) {
      for (const d of [...p.brief, ...p.note, ...p.carePlan]) {
        expect(d.cites.length, `${p.name}: ${d.text}`).toBeGreaterThan(0);
      }
    }
  });

  it('every brief is 3 lines at most', () => {
    for (const p of all) expect(p.brief.length).toBeLessThanOrEqual(3);
  });

  it('every transcript citation points at a real transcript line', () => {
    for (const p of all) {
      for (const d of [...p.note, ...p.carePlan]) {
        for (const c of d.cites) {
          if (c.t !== undefined) expect(p.transcript.some((l) => l.t === c.t), `${p.name} ${c.label}`).toBe(true);
        }
      }
    }
  });

  it('never calls a member non-adherent', () => {
    const text = JSON.stringify(all).toLowerCase();
    expect(text).not.toContain('non-adherent');
    expect(text).not.toContain('nonadherent');
  });

  it('holds transcript sentences until the call reaches them', () => {
    const s1 = harold.note[0];
    const c = initialCase();
    expect(sentencePending(s1.cites, c)).toBe(true);
    c.consent = true;
    c.lastCallSecs = 100;
    expect(sentencePending(s1.cites, c)).toBe(true);
    c.lastCallSecs = 192;
    expect(sentencePending(s1.cites, c)).toBe(false);
  });

  it('dictation stands in when there is no consent', () => {
    const c = initialCase();
    c.dictation = 'Grace says he missed doses.';
    expect(sentencePending(harold.note[0].cites, c)).toBe(false);
  });
});

describe('edit rate', () => {
  it('O7: is the share of drafted sentences changed', () => {
    const c = initialCase();
    expect(editRate(harold, c)).toBe(0);
    c.edits['P1-O1'] = 'No furosemide fill since 14 Sep; bottle confirms 20 mg.';
    expect(editRate(harold, c)).toBe(8); // 1 of 12
    c.edits['P1-C1'] = 'Furosemide in hand today';
    expect(editRate(harold, c)).toBe(17); // 2 of 12
  });

  it('ignores whitespace-only changes and reverted edits', () => {
    const c = initialCase();
    c.edits['P1-O1'] = `${harold.note[1].text}  `;
    expect(editRate(harold, c)).toBe(0);
  });
});
