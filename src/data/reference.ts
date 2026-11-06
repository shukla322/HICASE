/** Reference tables from the PRD, deck and annex. */
import type { FeedKey } from '../domain/types';

export const FEED_SHORT: Record<FeedKey, string> = {
  elig: 'Elig', adt: 'ADT', claims: 'Claim', pharm: 'Pharm', contact: 'Contact', um: 'UM', notes: 'Notes',
  appt: 'Appts', sdoh: 'SDOH', ccd: 'CCD', caregiver: 'Caregiver', benefits: 'Benefits', hedis: 'Gaps', labs: 'Labs',
};

export const FEED_NAMES: Record<FeedKey, string> = {
  elig: 'Member and eligibility', adt: 'ADT alerts', claims: 'Medical claims', pharm: 'Pharmacy fills',
  contact: 'Contact history', um: 'Authorizations (UM)', notes: 'Case notes and care plan', appt: 'Appointments',
  sdoh: 'SDOH and HRA screens', ccd: 'Discharge summary (CCD)', caregiver: 'Caregiver and language',
  benefits: 'Plan benefits', hedis: 'HEDIS care gaps', labs: 'Labs and vitals',
};

export interface DatasetRow { n: number; name: string; source: string; freshness: string; tier: 'MUST' | 'MUST-lite' | 'LATER' }

export const DATASETS: DatasetRow[] = [
  { n: 1, name: 'Member and eligibility', source: 'Plan enrollment', freshness: 'Daily', tier: 'MUST' },
  { n: 2, name: 'ADT alerts (ED, admit, discharge)', source: 'Hospital and HIE feeds', freshness: 'Minutes to hours', tier: 'MUST' },
  { n: 3, name: 'Medical claims', source: 'Plan adjudication', freshness: '30 to 60 d lag', tier: 'MUST' },
  { n: 4, name: 'Pharmacy fills (PBM)', source: 'PBM and e-prescribing', freshness: '1 to 3 days', tier: 'MUST' },
  { n: 5, name: 'Contact and outreach history', source: 'Case-management system', freshness: 'Real time', tier: 'MUST' },
  { n: 6, name: 'Prior authorization (UM)', source: 'UM system', freshness: 'Daily', tier: 'MUST' },
  { n: 7, name: 'Case notes and care plan', source: 'Case-management platform', freshness: 'Real time', tier: 'MUST' },
  { n: 8, name: 'Appointments and follow-up', source: 'Schedules, claims proxy, HIE', freshness: 'Daily to weekly', tier: 'MUST' },
  { n: 9, name: 'SDOH and HRA screens', source: 'HRA, screenings, Z-codes', freshness: '6 to 12 mo old', tier: 'MUST' },
  { n: 10, name: 'Discharge summary (CCD)', source: 'HIE and hospital EHR', freshness: 'Hours to days, partial', tier: 'MUST-lite' },
  { n: 11, name: 'Caregiver, language, preferences', source: 'Enrollment, notes, calls', freshness: 'Static, can go stale', tier: 'MUST-lite' },
  { n: 12, name: 'Plan benefits', source: 'Benefit system', freshness: 'Plan year', tier: 'MUST-lite' },
  { n: 13, name: 'Program enrollment and care gaps', source: 'Quality and enrollment', freshness: 'Weekly', tier: 'MUST-lite' },
  { n: 14, name: 'Labs and vitals (LOINC)', source: 'Lab feeds, HIE', freshness: 'Days', tier: 'LATER' },
  { n: 15, name: 'Risk scores and HCC', source: 'Plan or vendor', freshness: 'Monthly', tier: 'LATER' },
  { n: 16, name: 'Phone validity and best-time model', source: 'Telco validation, own outcomes', freshness: 'Weekly', tier: 'LATER' },
  { n: 17, name: 'Home health and DME vendor status', source: 'Vendors', freshness: 'Days', tier: 'LATER' },
  { n: 18, name: 'Community resources', source: 'Directories', freshness: 'Monthly', tier: 'LATER' },
];

export interface BudgetRow { bucket: string; today: number; target: number; mechanism: string }

/** Minutes in a 450-minute day. Estimated; replaced by the week-0 time-and-motion study. */
export const TIME_BUDGET: BudgetRow[] = [
  { bucket: 'Clinical conversations', today: 90, target: 240, mechanism: 'All 150 recovered minutes reinvested (upper bound)' },
  { bucket: 'Documentation', today: 135, target: 90, mechanism: 'Assessment prefilled; note and care plan drafted' },
  { bucket: 'Data hunting', today: 112, target: 45, mechanism: 'One Member 360 page replaces 6 to 7 screens' },
  { bucket: 'Outreach attempts', today: 68, target: 45, mechanism: 'Best number, time and language; fewer failed dials' },
  { bucket: 'Admin and tracking', today: 45, target: 30, mechanism: 'Ranked queue replaces the side spreadsheet' },
];

export interface MetricRow { metric: string; baseline: string; target: string; basis: string }

export const METRICS: MetricRow[] = [
  { metric: 'Prep time per member', baseline: 'About 8 min', target: 'About 3 min', basis: 'Estimated' },
  { metric: 'Documentation per day', baseline: '135 min (30%)', target: '90 min (20%)', basis: 'Estimated' },
  { metric: 'Clinical conversation per day', baseline: '90 min (20%)', target: '165 min (37%), conservative', basis: 'Estimated' },
  { metric: 'Outreach connect rate', baseline: 'About 30% (5 of 17)', target: '45% or more', basis: 'Assumed' },
  { metric: 'Contact within 2 business days', baseline: 'Measure in week 0', target: '90% or more', basis: 'TCM and TRC clock' },
  { metric: 'Active cases per case manager', baseline: '48', target: '55 to 58', basis: 'Hypothesis' },
  { metric: 'Medication conflicts resolved by first call', baseline: 'n/a', target: '90% or more', basis: 'Target' },
  { metric: 'AI draft edit rate; trust score (1 to 5)', baseline: 'n/a', target: 'Under 30%; 4 or more', basis: 'Target' },
];

export const AUTOMATION: [string, string][] = [
  ['Ranks the queue and computes the clocks', 'Whether to follow or override the order, with a reason'],
  ['Prefills the assessment from sources', 'Every prefilled clinical answer, before it counts'],
  ['Ranks medication candidates and flags conflicts', 'Medication reconciliation: Resolve with a reason'],
  ['Drafts note, care plan and audit form with citations', 'Edits and signs; nothing is written unsigned'],
  ['Suggests number, time and language', 'Which number to dial; risk flags and diagnoses are hers'],
];

export const SNOOZE_REASONS = [
  'Member asked to be called later',
  'Clinical judgment: lower risk than scored',
  'Handed off to another case manager',
  'Contact completed outside HiCase',
];

export const RAISE_REASONS = [
  'Clinical judgment: higher risk than scored',
  'Caregiver or member asked for a call today',
  'New information not yet in the feeds',
];
