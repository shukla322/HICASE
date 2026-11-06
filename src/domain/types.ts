/** Domain model for the workbench. All records are synthetic. */

/** The 13 MVP datasets (9 MUST, 4 MUST-lite), plus labs, shown only in the raw drawer. */
export type FeedKey =
  | 'elig' | 'adt' | 'claims' | 'pharm' | 'contact' | 'um' | 'notes' | 'appt' | 'sdoh'
  | 'ccd' | 'caregiver' | 'benefits' | 'hedis' | 'labs';

export type SignalKey = 'acuity' | 'time' | 'newData' | 'reach';
export type Signals = Record<SignalKey, number>;
export type Weights = Record<SignalKey, number>;

export type Freshness = 'green' | 'amber' | 'red';
export type Confidence = 'High' | 'Medium' | 'Low' | 'None';

/** A citation: a source record, a transcript time, or both. */
export interface Cite {
  label: string;
  feed?: FeedKey;
  /** Transcript time in seconds. */
  t?: number;
}

export interface BriefSentence { text: string; cites: Cite[] }

export interface RiskCard {
  title: string;
  detail: string;
  feed: FeedKey;
  /** Extra label beside the age, such as "unknown source". */
  qualifier?: string;
}

export type MedSourceKey = 'ccd' | 'pharm' | 'claims' | 'notes';
export interface MedSource { value: string; date: string | null }

export interface Fill { drug: string; date: string; daysSupply: number }

export interface MedRow {
  drug: string;
  status: 'conflict' | 'check' | 'match';
  sources: Partial<Record<MedSourceKey, MedSource>>;
  /** Fill record used for the supply-gap calculation. */
  fill?: Fill;
  /** Decisions that are not a source value, for example "Ask on call". */
  options?: string[];
}

export interface TimelineEvent {
  date: string;
  label: string;
  feed: FeedKey;
  /** The last claim on file anchors the blind-spot bar. */
  lastClaim?: boolean;
}

export interface Phone {
  id: string;
  owner: string;
  role: 'member' | 'caregiver' | 'care-team';
  number: string;
  kind: string;
  confidence: Confidence;
  lastVerified: string | null;
  note: string;
  /** Best number by the outreach rules. */
  best?: boolean;
  /** Rules advise against dialing this number again. */
  doNotDial?: boolean;
}

export interface CallPlan {
  who: string;
  language: string;
  asks: string[];
  book: string;
  addresses?: { label: string; value: string; feed: FeedKey }[];
  fallback?: string;
}

export type NoteSection = 'S' | 'O' | 'A' | 'P';
export interface DraftSentence { id: string; section: NoteSection; text: string; cites: Cite[] }

export type PlanKind = 'Goal' | 'Barrier' | 'Intervention' | 'Follow-up';
export interface PlanItem { id: string; kind: PlanKind; text: string; cites: Cite[] }

export interface TranscriptLine { t: number; speaker: string; text: string }

export interface SourceRecord { feed: FeedKey; date: string | null; text: string; note?: string }

export interface Patient {
  id: string;
  name: string;
  age: number;
  sex: 'M' | 'F';
  plan: string;
  program: string;
  /** Short tag line for the queue row. */
  tags: string;
  condition: string;
  language: string;
  pcp: string;
  memberId: string;
  caregiver: string;
  bestTime: string;
  /** Local hours for the best-time window, when one is known. */
  bestWindow?: [number, number];

  /** Discharge date starts the TCM clock. Absent means no contact clock runs. */
  discharge?: { date: string; complexity: 'high' | 'moderate' };
  softClock?: string;
  softDueToday?: boolean;

  signals: Signals;
  signalWhy: Record<SignalKey, string>;
  estHours: number;
  whyNow: string;
  nextAction: string;
  newSinceTouch?: string;
  duplicate?: { otherId: string; rows: { field: string; a: string; b: string; differs?: boolean }[] };

  /** Feed "as of" dates. null means the feed has not arrived: shown as unknown. */
  feeds: Partial<Record<FeedKey, string | null>>;
  rowFeeds: FeedKey[];
  lastClaim: string | null;

  brief: BriefSentence[];
  risks: RiskCard[];
  meds: MedRow[];
  timeline: TimelineEvent[];
  callPlan: CallPlan;
  sdoh: { date: string | null; text: string };
  loops: string[];
  phones: Phone[];
  assist: string[];

  assessment: {
    /** Fields that must be asked on the call. */
    ask: string[];
    /** Fields where sources disagree; the array holds the competing values. */
    conflicts: Record<string, string[]>;
    /** Member-specific prefilled values. Fields not listed fall back to the template. */
    values: Record<string, string>;
    /** Source override when a value comes from somewhere other than the template feed. */
    valueFeeds?: Record<string, FeedKey>;
    /** No history yet: everything except the listed values must be asked. */
    sparse?: boolean;
  };

  note: DraftSentence[];
  carePlan: PlanItem[];
  tasks: string[];
  referrals: string[];
  transcript: TranscriptLine[];
  records: SourceRecord[];
}

export type OverrideKind = 'snooze' | 'top' | 'lower';
export interface RankOverride { kind: OverrideKind; reason: string; note?: string }
export interface Decision { pick: string; reason: string }

export type CallOutcome = 'Reached' | 'Voicemail' | 'No answer' | 'Wrong number' | 'Disconnected';
export interface CallAttempt { at: number; phoneId: string; outcome: CallOutcome; seconds: number }

export interface CaseState {
  override: RankOverride | null;
  touched: boolean;
  briefConfirmed: boolean;
  medDecisions: Record<string, Decision>;
  fieldDecisions: Record<string, Decision>;
  captured: Record<string, string>;
  duplicateDecision: Decision | null;
  /** Live call. secs is playback time; null means no call is active. */
  call: { phoneId: string; secs: number } | null;
  /** Seconds covered by the last connected call. */
  lastCallSecs: number | null;
  /** A call has ended and is waiting for its outcome. */
  pendingOutcome: { phoneId: string; secs: number } | null;
  attempts: CallAttempt[];
  consent: boolean;
  dictation: string;
  /** Edited text by sentence or plan-item id. */
  edits: Record<string, string>;
  manualNote: string;
  manualPlan: string;
  reviewed: boolean;
  signed: { at: number; editRate: number; trust: number | null } | null;
}

export type AuditKind = 'view' | 'override' | 'resolve' | 'merge' | 'call' | 'draft' | 'sign' | 'config' | 'alert';
export interface AuditEntry {
  id: number;
  at: number;
  user: string;
  kind: AuditKind;
  action: string;
  member: string;
  reason: string;
}

export type AiFeature = 'brief' | 'prefill' | 'note' | 'plan';

export interface AppState {
  /** Minutes the demo clock has moved past Mon 9 Nov 2026, 8:00 am. */
  offsetMin: number;
  weights: Weights;
  cases: Record<string, CaseState>;
  arrivals: { index: number; at: number }[];
  audit: AuditEntry[];
  nextAuditId: number;
  aiEnabled: Record<AiFeature, boolean>;
  degraded: boolean;
}
