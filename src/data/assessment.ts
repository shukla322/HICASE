import type { FeedKey } from '../domain/types';

export interface FieldDef { name: string; feed: FeedKey; fallback?: string }
export interface FieldGroup { title: string; fields: FieldDef[] }

/** The 40-field assessment: 8 groups of 5. Each field names the dataset it prefills from. */
export const ASSESSMENT: FieldGroup[] = [
  { title: 'Identity and contact', fields: [
    { name: 'Language / interpreter', feed: 'elig' },
    { name: 'Preferred contact', feed: 'contact' },
    { name: 'Caregiver', feed: 'caregiver' },
    { name: 'Best time to call', feed: 'contact' },
    { name: 'Phone verified', feed: 'contact' },
  ] },
  { title: 'Clinical', fields: [
    { name: 'Primary diagnosis', feed: 'ccd' },
    { name: 'Discharge reason', feed: 'ccd' },
    { name: 'Functional status', feed: 'notes', fallback: 'Independent at last assessment' },
    { name: 'Pain', feed: 'notes', fallback: 'No pain flag in notes' },
    { name: 'Symptoms since discharge', feed: 'notes', fallback: 'None recorded' },
  ] },
  { title: 'Medications', fields: [
    { name: 'Medication list reconciled', feed: 'ccd' },
    { name: 'Adherence', feed: 'pharm', fallback: 'Fills on time' },
    { name: 'Fill gaps', feed: 'pharm', fallback: 'None in 30 days' },
    { name: 'Allergies', feed: 'ccd' },
    { name: 'High-risk meds', feed: 'ccd' },
  ] },
  { title: 'Follow-up', fields: [
    { name: 'PCP visit booked', feed: 'appt' },
    { name: 'Specialist visit', feed: 'appt', fallback: 'None due' },
    { name: 'Labs due', feed: 'hedis', fallback: 'None flagged' },
    { name: 'DME / home health', feed: 'um', fallback: 'None requested' },
    { name: 'Transport to visit', feed: 'sdoh' },
  ] },
  { title: 'Social needs (SDOH)', fields: [
    { name: 'Transport', feed: 'sdoh' },
    { name: 'Housing', feed: 'sdoh', fallback: 'No concern on last screen' },
    { name: 'Food', feed: 'sdoh', fallback: 'No concern on last screen' },
    { name: 'Cost of care', feed: 'sdoh', fallback: 'No concern on last screen' },
    { name: 'Social support', feed: 'notes', fallback: 'No concern in notes' },
  ] },
  { title: 'Safety', fields: [
    { name: 'Falls / mobility', feed: 'notes', fallback: 'No flag in notes' },
    { name: 'Cognition', feed: 'notes', fallback: 'No flag in notes' },
    { name: 'Mood screen', feed: 'notes', fallback: 'No flag in notes' },
    { name: 'Home safety', feed: 'notes', fallback: 'No flag in notes' },
    { name: 'Red flags reviewed', feed: 'notes', fallback: 'None open in notes' },
  ] },
  { title: 'Care coordination', fields: [
    { name: 'Authorizations', feed: 'um', fallback: 'None pending' },
    { name: 'Benefits available', feed: 'benefits', fallback: 'Ride, mail-order and OTC benefits on plan' },
    { name: 'Community resources', feed: 'notes', fallback: 'None in use' },
    { name: 'Care-plan goals', feed: 'notes', fallback: 'Carried from last plan' },
    { name: 'Patient goals', feed: 'notes', fallback: 'Carried from last plan' },
  ] },
  { title: 'Education', fields: [
    { name: 'Condition understanding', feed: 'notes', fallback: 'Documented in last note' },
    { name: 'Warning signs taught', feed: 'notes', fallback: 'Documented in last note' },
    { name: 'Teach-back done', feed: 'notes', fallback: 'Documented in last note' },
    { name: 'Self-management plan', feed: 'notes', fallback: 'Documented in last note' },
    { name: 'Caregiver strain', feed: 'notes', fallback: 'No cue in notes' },
  ] },
];

export const ALL_FIELDS: FieldDef[] = ASSESSMENT.flatMap((g) => g.fields);
