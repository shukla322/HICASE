import { ALL_FIELDS, type FieldDef } from '../data/assessment';
import { openMeds } from './rules';
import type { CaseState, FeedKey, Patient } from './types';

export type FieldStatus = 'prefilled' | 'ask' | 'conflict' | 'captured' | 'resolved';

export interface FieldView {
  name: string;
  status: FieldStatus;
  value: string | null;
  feed: FeedKey;
  /** Competing values when the status is conflict. */
  options?: string[];
  /** The field is settled through the medication panel. */
  medField?: boolean;
}

const MED_FIELD = 'Medication list reconciled';

export const fieldView = (p: Patient, c: CaseState, def: FieldDef, prefillOn: boolean): FieldView => {
  const { name } = def;
  const a = p.assessment;
  const feed = a.valueFeeds?.[name] ?? def.feed;
  const base = { name, feed };
  if (c.captured[name]) return { ...base, status: 'captured', value: c.captured[name] };
  if (c.fieldDecisions[name]) return { ...base, status: 'resolved', value: c.fieldDecisions[name].pick };

  if (name in a.conflicts) {
    if (name === MED_FIELD) {
      return openMeds(p, c).length
        ? { ...base, status: 'conflict', value: null, medField: true }
        : { ...base, status: 'resolved', value: 'Reconciled in the medication panel' };
    }
    return { ...base, status: 'conflict', value: null, options: a.conflicts[name] };
  }
  if (a.ask.includes(name) || !prefillOn) return { ...base, status: 'ask', value: null };

  const specific = a.values[name];
  if (specific) return { ...base, status: 'prefilled', value: specific };
  // Unknown stays unknown: no template value without a source record behind it.
  if (a.sparse || !def.fallback || !p.feeds[feed]) return { ...base, status: 'ask', value: null };
  return { ...base, status: 'prefilled', value: def.fallback };
};

export const assessmentViews = (p: Patient, c: CaseState, prefillOn: boolean): FieldView[] =>
  ALL_FIELDS.map((f) => fieldView(p, c, f, prefillOn));

export interface FieldCounts { prefilled: number; ask: number; conflict: number; settled: number }

export const assessmentCounts = (p: Patient, c: CaseState, prefillOn: boolean): FieldCounts => {
  const n: FieldCounts = { prefilled: 0, ask: 0, conflict: 0, settled: 0 };
  for (const v of assessmentViews(p, c, prefillOn)) {
    if (v.status === 'prefilled') n.prefilled += 1;
    else if (v.status === 'ask') n.ask += 1;
    else if (v.status === 'conflict') n.conflict += 1;
    else n.settled += 1;
  }
  return n;
};
