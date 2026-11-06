/**
 * New discharge alerts for the demo. Only ADT and eligibility have arrived, so
 * almost everything shows as unknown, which is the point: unknown is never "none".
 */
import { fmtDay, fmtTime } from '../domain/dates';
import { tcmClock } from '../domain/rules';
import type { Cite, Patient } from '../domain/types';

const SEEDS = [
  { name: 'Walter Bishop', age: 84, sex: 'M', plan: 'MA-HMO', tags: 'Pneumonia · MA-HMO', dx: 'Pneumonia (ADT only)', language: 'English', pcp: 'Dr. K. Ames', memberId: 'M-41200', number: '(555) 0180' },
  { name: 'Rosa Delgado', age: 72, sex: 'F', plan: 'D-SNP', tags: 'Hip fracture · D-SNP', dx: 'Hip fracture (ADT only)', language: 'Spanish (interpreter)', pcp: 'Dr. L. Vega', memberId: 'M-41237', number: '(555) 0183' },
  { name: 'Ibrahim Yusuf', age: 69, sex: 'M', plan: 'MA-PPO', tags: 'COPD · MA-PPO', dx: 'COPD exacerbation (ADT only)', language: 'English', pcp: 'Dr. S. Mehta', memberId: 'M-41274', number: '(555) 0186' },
] as const;

export const ARRIVAL_COUNT = SEEDS.length;

const ADT: Cite = { label: 'ADT', feed: 'adt' };
const ELIG: Cite = { label: 'Eligibility', feed: 'elig' };
const DISCHARGE_DATE = '2026-11-09';

export const buildArrival = (index: number, at: number): Patient => {
  const s = SEEDS[index];
  const id = `N${index + 1}`;
  const discharge = { date: DISCHARGE_DATE, complexity: 'moderate' as const };
  const { contactDue, visitDue } = tcmClock(discharge);
  const contactText = `Contact due ${fmtDay(contactDue)}, 5 pm`;
  const visitText = `PCP visit by ${fmtDay(visitDue)}`;
  return {
    id, name: s.name, age: s.age, sex: s.sex, plan: s.plan, program: 'Transitions of Care',
    tags: s.tags, condition: s.dx, language: s.language, pcp: s.pcp, memberId: s.memberId,
    caregiver: 'Not on file', bestTime: 'unknown', discharge,
    signals: { acuity: 0.7, time: 0.8, newData: 1, reach: 0.4 },
    signalWhy: {
      acuity: 'Fresh discharge; reason and medications not yet known.',
      time: contactText,
      newData: 'New discharge alert today.',
      reach: 'No contact history; number unverified.',
    },
    estHours: 0.8,
    whyNow: `New discharge alert at ${fmtTime(at)}; reason unknown; claims, pharmacy and discharge summary not yet received.`,
    nextAction: 'Call to confirm status',
    newSinceTouch: 'New discharge alert',
    feeds: {
      elig: '2026-11-08', adt: DISCHARGE_DATE, claims: null, pharm: null, contact: null, um: null,
      notes: null, appt: null, sdoh: null, ccd: null, caregiver: null, benefits: null, hedis: null,
    },
    rowFeeds: ['adt', 'claims'],
    lastClaim: null,
    brief: [
      { text: 'Discharged per ADT alert today; reason not sent.', cites: [ADT] },
      { text: 'No claims, fills, discharge summary or appointments received yet: shown as unknown, not as none.', cites: [ADT] },
      { text: 'No contact history with this plan’s case management.', cites: [ELIG] },
    ],
    risks: [
      { title: 'Reason unknown', detail: 'ADT carries no diagnosis', feed: 'adt' },
      { title: 'No pharmacy data', detail: 'Fill feed not yet received', feed: 'pharm' },
      { title: 'No follow-up data', detail: 'Appointments unknown', feed: 'appt' },
    ],
    meds: [],
    timeline: [{ date: DISCHARGE_DATE, label: 'Discharge alert received', feed: 'adt' }],
    callPlan: {
      who: `${s.name} (number to verify)`, language: s.language,
      asks: ['What was the reason for the stay?', 'Which medications came home?', 'Is a follow-up visit booked?'],
      book: visitText,
    },
    sdoh: { date: null, text: 'No screen on file. Screen on the first call.' },
    loops: [contactText, 'Confirm discharge reason', 'Medication reconciliation'],
    phones: [{ id: 'own', owner: `${s.name} (number on file)`, role: 'member', number: s.number, kind: 'mobile', confidence: 'Low', lastVerified: null, note: 'Unverified', best: true }],
    assist: ['Confirm identity and discharge date', 'Reason for the stay and discharge instructions', 'Medications at home', 'Is a follow-up visit booked?'],
    assessment: { ask: [], conflicts: {}, sparse: true, values: { 'Language / interpreter': s.language } },
    note: [
      { id: `${id}-S1`, section: 'S', text: 'Member confirms the discharge and the reason for the stay.', cites: [{ label: 'transcript 00:40', t: 40 }] },
      { id: `${id}-O1`, section: 'O', text: 'ADT discharge today; no other data received.', cites: [ADT] },
      { id: `${id}-A1`, section: 'A', text: 'Reason and medications unconfirmed until the discharge summary arrives.', cites: [ADT] },
      { id: `${id}-P1`, section: 'P', text: 'Request the discharge summary; book a PCP visit.', cites: [ADT] },
    ],
    carePlan: [
      { id: `${id}-C1`, kind: 'Goal', text: 'Confirm reason and medications', cites: [ADT] },
      { id: `${id}-C2`, kind: 'Goal', text: visitText, cites: [ADT] },
      { id: `${id}-C3`, kind: 'Follow-up', text: 'Call back in 48 hours', cites: [ADT] },
    ],
    tasks: ['Request discharge summary', 'Book PCP visit', 'Call back in 48 hours'],
    referrals: [],
    transcript: [
      { t: 12, speaker: 'Maria', text: 'Hello, this is Maria, a nurse with your health plan, calling after your hospital stay.' },
      { t: 40, speaker: s.name.split(' ')[0], text: 'Yes, I came home today.' },
      { t: 70, speaker: 'Maria', text: 'Can you tell me why you were in the hospital, and which medicines you came home with?' },
    ],
    records: [
      { feed: 'adt', date: DISCHARGE_DATE, text: `Discharge alert received ${fmtTime(at)}. Reason not sent.` },
      { feed: 'elig', date: '2026-11-08', text: `${s.memberId}; ${s.plan}; PCP ${s.pcp}; language ${s.language}.` },
      { feed: 'claims', date: null, text: 'No claims received yet.' },
      { feed: 'pharm', date: null, text: 'No pharmacy data received yet.' },
      { feed: 'notes', date: null, text: 'No case notes yet.' },
      { feed: 'labs', date: null, text: 'Labs and vitals are a LATER dataset; no lab feed in the MVP.' },
    ],
  };
};
