/**
 * The rules service from PRD section 4: score, clocks, freshness, supply gaps,
 * medication candidates and queue logic. Everything here is pure and tested.
 */
import { addBusinessDays, addDays, ageDays, fmtDay, fmtTime, parseDate, sameDay, toIso } from './dates';
import type {
  CaseState, Cite, Confidence, DraftSentence, FeedKey, Fill, Freshness, MedRow, MedSourceKey,
  Patient, Phone, PlanItem, SignalKey, Signals, Weights,
} from './types';

/* ---------- score ---------- */

export const DEFAULT_WEIGHTS: Weights = { acuity: 35, time: 30, newData: 20, reach: 15 };

export const SIGNAL_LABELS: Record<SignalKey, string> = {
  acuity: 'Acuity',
  time: 'Time-sensitivity',
  newData: 'New data',
  reach: 'Reach',
};

export const SIGNAL_ORDER: SignalKey[] = ['acuity', 'time', 'newData', 'reach'];

/**
 * score = round(sum of weight x strength). Half rounds up, like Excel ROUND;
 * the epsilon stops float noise pushing 89.5 down to 89.
 */
export const score = (signals: Signals, w: Weights): number =>
  Math.round(SIGNAL_ORDER.reduce((sum, k) => sum + w[k] * signals[k], 0) + 1e-9);

/* ---------- freshness ---------- */

/** Green at 2 days or less, amber 3 to 14 days, red over 14 days or unknown. */
export const freshness = (age: number | null): Freshness =>
  age === null ? 'red' : age <= 2 ? 'green' : age <= 14 ? 'amber' : 'red';

/** "3 d" up to 59 days, then "9 mo". */
export const fmtAge = (age: number | null): string =>
  age === null ? 'unknown' : age >= 60 ? `${Math.round(age / 30.4)} mo` : `${age} d`;

export const feedAge = (p: Patient, feed: FeedKey, now: Date): number | null => {
  const d = p.feeds[feed];
  return d ? ageDays(d, now) : null;
};

/* ---------- supply gap ---------- */

export const supplyEnd = (f: Fill): Date => addDays(parseDate(f.date), f.daysSupply);

/** Gap days = as-of date minus supply end, floored at 0. */
export const supplyGapDays = (f: Fill, now: Date): number =>
  Math.max(0, ageDays(toIso(supplyEnd(f)), now));

/* ---------- clocks ---------- */

export const CONTACT_DUE_HOUR = 17;

export interface TcmClock { contactDue: Date; visitDue: Date }

/** 2 business days to contact; 7 days to visit for high complexity, 14 for moderate. */
export const tcmClock = (discharge: NonNullable<Patient['discharge']>): TcmClock => {
  const start = parseDate(discharge.date);
  const due = addBusinessDays(start, 2);
  due.setHours(CONTACT_DUE_HOUR, 0, 0, 0);
  return { contactDue: due, visitDue: addDays(start, discharge.complexity === 'high' ? 7 : 14) };
};

export type ClockTone = 'red' | 'amber' | 'neutral' | 'done';
export interface ClockView { label: string; sub?: string; tone: ClockTone; hoursLeft: number | null }

const fmtLeft = (hours: number): string => {
  const mins = Math.round(hours * 60);
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h >= 24 ? `${Math.floor(h / 24)} d ${h % 24} h` : `${h} h ${m} m`;
};

export const contactMade = (c: CaseState): number | null =>
  c.attempts.find((a) => a.outcome === 'Reached')?.at ?? null;

export const clockView = (p: Patient, c: CaseState, now: Date): ClockView => {
  const made = contactMade(c);
  if (!p.discharge) {
    return made
      ? { label: `Contact made ${fmtTime(made)}`, tone: 'done', hoursLeft: null }
      : { label: p.softClock ?? 'No clock', tone: 'neutral', hoursLeft: null };
  }
  const { contactDue, visitDue } = tcmClock(p.discharge);
  const visit = `Visit by ${fmtDay(visitDue)}`;
  if (made) return { label: `Contact made ${fmtTime(made)}`, sub: visit, tone: 'done', hoursLeft: null };

  const hours = (contactDue.getTime() - now.getTime()) / 3_600_000;
  const day = sameDay(contactDue, now) ? `${fmtTime(contactDue)} today` : fmtDay(contactDue);
  if (hours <= 0) {
    return { label: `Contact overdue (was ${day})`, sub: visit, tone: 'red', hoursLeft: hours };
  }
  return {
    label: `Contact due ${day}`,
    sub: `${fmtLeft(hours)} left · ${visit}`,
    tone: hours < 4 ? 'red' : hours < 24 ? 'amber' : 'neutral',
    hoursLeft: hours,
  };
};

/* ---------- medication candidates ---------- */

export const MED_SOURCE_LABELS: Record<MedSourceKey, string> = {
  ccd: 'Discharge CCD',
  pharm: 'Pharmacy fills',
  claims: 'Claims',
  notes: 'Case notes',
};

/** Order of authority: discharge CCD, pharmacy fills, claims, old notes. */
export const MED_SOURCE_ORDER: MedSourceKey[] = ['ccd', 'pharm', 'claims', 'notes'];
const RELIABILITY: Record<MedSourceKey, number> = { ccd: 1, pharm: 0.85, claims: 0.6, notes: 0.4 };

export interface MedCandidate {
  source: MedSourceKey;
  value: string;
  date: string | null;
  strength: number;
}

/**
 * Ranks candidates by recency x source reliability x fill evidence.
 * This only orders the options. It never picks: Maria resolves with a reason.
 */
export const rankCandidates = (med: MedRow, now: Date): MedCandidate[] =>
  MED_SOURCE_ORDER.flatMap((source) => {
    const s = med.sources[source];
    if (!s || !s.date) return [];
    const recency = 1 / (1 + ageDays(s.date, now) / 30);
    const fillEvidence = source === 'pharm' ? 1 : 0.7;
    const strength = recency * RELIABILITY[source] * fillEvidence;
    return [{ source, value: s.value, date: s.date, strength }];
  }).sort((a, b) => b.strength - a.strength);

export const openMeds = (p: Patient, c: CaseState): MedRow[] =>
  p.meds.filter((m) => m.status !== 'match' && !c.medDecisions[m.drug]);

/* ---------- reach ---------- */

const USABLE: Confidence[] = ['High', 'Medium'];

/** Unreachable: no usable number for the member or a caregiver. */
export const isUnreachable = (p: Patient): boolean =>
  !p.phones.some((n) => n.role !== 'care-team' && USABLE.includes(n.confidence));

export const bestPhone = (p: Patient): Phone => p.phones.find((n) => n.best) ?? p.phones[0];

/** Logged wrong-number or disconnected outcomes drop the number's confidence to None. */
export const effectiveConfidence = (n: Phone, c: CaseState): Confidence => {
  const bad = c.attempts.some(
    (a) => a.phoneId === n.id && (a.outcome === 'Wrong number' || a.outcome === 'Disconnected'),
  );
  return bad ? 'None' : n.confidence;
};

export interface WindowState { state: 'now' | 'later' | 'passed' | 'unknown'; label: string }

export const bestWindowState = (p: Patient, now: Date): WindowState => {
  if (!p.bestWindow) return { state: 'unknown', label: `Best time: ${p.bestTime}` };
  const [from, to] = p.bestWindow;
  const h = now.getHours() + now.getMinutes() / 60;
  const start = new Date(now);
  start.setHours(from, 0, 0, 0);
  if (h < from) return { state: 'later', label: `Best window opens ${fmtTime(start)}` };
  if (h >= to) return { state: 'passed', label: 'Best window has passed today' };
  return { state: 'now', label: 'In the best window now' };
};

/* ---------- queue ---------- */

export type QueueFilter = 'all' | 'discharges' | 'due' | 'unreachable' | 'review';
export type QueueSort = 'score' | 'clock';

export const FILTER_LABELS: Record<QueueFilter, string> = {
  all: 'All',
  discharges: 'Discharges',
  due: 'Due today',
  unreachable: 'Unreachable',
  review: 'Needs review',
};

export const needsReview = (p: Patient, c: CaseState): boolean =>
  (!!p.duplicate && !c.duplicateDecision) ||
  p.meds.some((m) => m.status === 'conflict' && !c.medDecisions[m.drug]);

export const dueToday = (p: Patient, c: CaseState, now: Date): boolean => {
  if (c.signed) return false;
  if (p.softDueToday) return true;
  if (!p.discharge || contactMade(c)) return false;
  const due = tcmClock(p.discharge).contactDue;
  return sameDay(due, now) || due < now;
};

export const matchesFilter = (f: QueueFilter, p: Patient, c: CaseState, now: Date): boolean => {
  switch (f) {
    case 'all': return true;
    case 'discharges': return !!p.discharge;
    case 'due': return dueToday(p, c, now);
    case 'unreachable': return isUnreachable(p);
    case 'review': return needsReview(p, c);
  }
};

/** Pinned first, then the normal list, then lowered, signed and snoozed cases. */
const rankGroup = (c: CaseState): number => {
  if (c.override?.kind === 'snooze') return 4;
  if (c.signed) return 3;
  if (c.override?.kind === 'lower') return 2;
  if (c.override?.kind === 'top') return 0;
  return 1;
};

export const sortQueue = (
  list: Patient[],
  cases: Record<string, CaseState>,
  w: Weights,
  sort: QueueSort = 'score',
): Patient[] => {
  const dueAt = (p: Patient) =>
    p.discharge ? tcmClock(p.discharge).contactDue.getTime() : Number.POSITIVE_INFINITY;
  return [...list].sort((a, b) => {
    const g = rankGroup(cases[a.id]) - rankGroup(cases[b.id]);
    if (g) return g;
    if (sort === 'clock' && dueAt(a) !== dueAt(b)) return dueAt(a) - dueAt(b);
    return score(b.signals, w) - score(a.signals, w);
  });
};

/* ---------- capacity ---------- */

export const WORKDAY_HOURS = 7.5;
/** Routine follow-ups on the other cases: counted in capacity, not modelled as members. */
export const ROUTINE = { tasks: 9, hours: 2 };

export interface Capacity { tasks: number; hours: number; pct: number; over: boolean }

export const capacity = (list: Patient[], cases: Record<string, CaseState>): Capacity => {
  const open = list.filter((p) => !cases[p.id].signed && cases[p.id].override?.kind !== 'snooze');
  const hours = Math.round(open.reduce((h, p) => h + p.estHours, ROUTINE.hours) * 10) / 10;
  const pct = Math.round((hours / WORKDAY_HOURS) * 100);
  return { tasks: ROUTINE.tasks + open.length, hours, pct, over: pct > 100 };
};

/* ---------- drafts ---------- */

const transcriptTime = (cites: Cite[]): number | undefined => cites.find((x) => x.t !== undefined)?.t;

/** The consented call reached the time this sentence cites. */
export const transcriptCovers = (cites: Cite[], c: CaseState): boolean => {
  const t = transcriptTime(cites);
  return t !== undefined && c.consent && c.lastCallSecs !== null && c.lastCallSecs >= t;
};

/** The sentence depends on the conversation, and Maria dictated it instead. */
export const usesDictation = (cites: Cite[], c: CaseState): boolean =>
  transcriptTime(cites) !== undefined && !transcriptCovers(cites, c) && c.dictation.trim() !== '';

/**
 * A sentence citing a transcript time exists only once the consented call has
 * reached that time, or Maria has dictated the content instead.
 */
export const sentencePending = (cites: Cite[], c: CaseState): boolean =>
  transcriptTime(cites) !== undefined && !transcriptCovers(cites, c) && !usesDictation(cites, c);

/** What the system drafted, before Maria's edits. Dictation replaces the subjective line. */
export const draftBaseline = (d: DraftSentence | PlanItem, c: CaseState): string =>
  'section' in d && d.section === 'S' && usesDictation(d.cites, c) ? c.dictation.trim() : d.text;

export const currentText = (d: DraftSentence | PlanItem, c: CaseState): string =>
  c.edits[d.id] ?? draftBaseline(d, c);

/** O7: percentage of drafted sentences changed before signing. */
export const editRate = (p: Patient, c: CaseState): number => {
  const drafted = [...p.note, ...p.carePlan];
  if (!drafted.length) return 0;
  const changed = drafted.filter((d) => currentText(d, c).trim() !== draftBaseline(d, c).trim());
  return Math.round((changed.length / drafted.length) * 100);
};
