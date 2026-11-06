/**
 * All app state changes. Every action a clinician takes writes its audit entry
 * here, in the same step, so an action cannot happen without being logged.
 */
import { buildArrival } from '../data/arrivals';
import { PATIENTS } from '../data/patients';
import { AS_OF } from '../domain/dates';
import { DEFAULT_WEIGHTS, editRate } from '../domain/rules';
import type {
  AiFeature, AppState, AuditEntry, AuditKind, CallOutcome, CaseState, Decision, OverrideKind,
  Patient, SignalKey,
} from '../domain/types';

const USER = 'Maria T., RN';
export const PLAYBACK_STEP_SECS = 5;

export const initialCase = (): CaseState => ({
  override: null, touched: false, briefConfirmed: false, medDecisions: {}, fieldDecisions: {},
  captured: {}, duplicateDecision: null, call: null, lastCallSecs: null, pendingOutcome: null,
  attempts: [], consent: false, dictation: '', edits: {}, manualNote: '', manualPlan: '',
  reviewed: false, signed: null,
});

export const initialState = (): AppState => ({
  offsetMin: 0,
  weights: { ...DEFAULT_WEIGHTS },
  cases: Object.fromEntries(PATIENTS.map((p) => [p.id, initialCase()])),
  arrivals: [],
  audit: [],
  nextAuditId: 1,
  aiEnabled: { brief: true, prefill: true, note: true, plan: true },
  degraded: false,
});

export const nowOf = (s: AppState): Date => new Date(AS_OF.getTime() + s.offsetMin * 60_000);

export const allPatients = (s: AppState): Patient[] => [
  ...PATIENTS,
  ...s.arrivals.map((a) => buildArrival(a.index, a.at)),
];

export const findPatient = (s: AppState, id: string): Patient | undefined =>
  allPatients(s).find((p) => p.id === id);

export type Action =
  | { type: 'advance'; minutes: number }
  | { type: 'reset' }
  | { type: 'arrival' }
  | { type: 'viewed'; id: string; screen: string }
  | { type: 'override'; id: string; kind: OverrideKind; reason: string; note?: string }
  | { type: 'clearOverride'; id: string }
  | { type: 'briefConfirm'; id: string; confirmed: boolean }
  | { type: 'resolveMed'; id: string; drug: string; decision: Decision }
  | { type: 'resolveField'; id: string; field: string; decision: Decision }
  | { type: 'duplicate'; id: string; decision: Decision }
  | { type: 'capture'; id: string; field: string; value: string }
  | { type: 'consent'; id: string; value: boolean }
  | { type: 'callStart'; id: string; phoneId: string; label: string }
  | { type: 'callTick' }
  | { type: 'callSkip'; id: string }
  | { type: 'callEnd'; id: string }
  | { type: 'callOutcome'; id: string; outcome: CallOutcome; label: string }
  | { type: 'dictation'; id: string; value: string }
  | { type: 'edit'; id: string; key: string; value: string }
  | { type: 'manual'; id: string; field: 'manualNote' | 'manualPlan'; value: string }
  | { type: 'reviewed'; id: string; value: boolean }
  | { type: 'sign'; id: string; trust: number | null }
  | { type: 'weight'; key: SignalKey; value: number }
  | { type: 'weightsLogged' }
  | { type: 'weightsReset' }
  | { type: 'ai'; feature: AiFeature; label: string; enabled: boolean }
  | { type: 'degraded'; value: boolean };

const log = (s: AppState, kind: AuditKind, action: string, member: string, reason = ''): AppState => {
  const entry: AuditEntry = { id: s.nextAuditId, at: nowOf(s).getTime(), user: USER, kind, action, member, reason };
  return { ...s, audit: [entry, ...s.audit], nextAuditId: s.nextAuditId + 1 };
};

const patch = (s: AppState, id: string, change: Partial<CaseState>): AppState => ({
  ...s,
  cases: { ...s.cases, [id]: { ...s.cases[id], ...change } },
});

const OVERRIDE_LABEL: Record<OverrideKind, string> = {
  snooze: 'Override: snoozed',
  top: 'Override: moved to top',
  lower: 'Override: moved down',
};

export const reducer = (s: AppState, a: Action): AppState => {
  switch (a.type) {
    case 'advance':
      return { ...s, offsetMin: s.offsetMin + a.minutes };
    case 'reset':
      return initialState();

    case 'arrival': {
      const index = s.arrivals.length;
      const at = nowOf(s).getTime();
      const p = buildArrival(index, at);
      const next: AppState = {
        ...s,
        arrivals: [...s.arrivals, { index, at }],
        cases: { ...s.cases, [p.id]: initialCase() },
      };
      return log(next, 'alert', 'New discharge alert received (ADT)', p.name);
    }

    case 'viewed': {
      const p = findPatient(s, a.id);
      if (!p) return s;
      const action = `Viewed ${a.screen}`;
      const last = s.audit[0];
      const marked = s.cases[a.id].touched ? s : patch(s, a.id, { touched: true });
      if (last && last.kind === 'view' && last.action === action && last.member === p.name) return marked;
      return log(marked, 'view', action, p.name);
    }

    case 'override': {
      const p = findPatient(s, a.id)!;
      const reason = a.note ? `${a.reason} · ${a.note}` : a.reason;
      return log(
        patch(s, a.id, { override: { kind: a.kind, reason: a.reason, note: a.note } }),
        'override', OVERRIDE_LABEL[a.kind], p.name, reason,
      );
    }
    case 'clearOverride':
      return log(patch(s, a.id, { override: null }), 'override', 'Override removed', findPatient(s, a.id)!.name);

    case 'briefConfirm':
      return log(
        patch(s, a.id, { briefConfirmed: a.confirmed }), 'draft',
        a.confirmed ? 'AI brief confirmed' : 'AI brief returned to draft', findPatient(s, a.id)!.name,
      );

    case 'resolveMed': {
      const c = s.cases[a.id];
      return log(
        patch(s, a.id, { medDecisions: { ...c.medDecisions, [a.drug]: a.decision } }),
        'resolve', `Resolved medication: ${a.drug}`, findPatient(s, a.id)!.name,
        `${a.decision.pick} · ${a.decision.reason}`,
      );
    }
    case 'resolveField': {
      const c = s.cases[a.id];
      return log(
        patch(s, a.id, { fieldDecisions: { ...c.fieldDecisions, [a.field]: a.decision } }),
        'resolve', `Resolved conflict: ${a.field}`, findPatient(s, a.id)!.name,
        `${a.decision.pick} · ${a.decision.reason}`,
      );
    }
    case 'duplicate':
      return log(
        patch(s, a.id, { duplicateDecision: a.decision }), 'merge',
        `Merge review: ${a.decision.pick}`, findPatient(s, a.id)!.name, a.decision.reason,
      );

    case 'capture': {
      const captured = { ...s.cases[a.id].captured };
      if (a.value.trim()) captured[a.field] = a.value.trim();
      else delete captured[a.field];
      return patch(s, a.id, { captured });
    }

    case 'consent':
      return log(
        patch(s, a.id, { consent: a.value }), 'call',
        a.value ? 'Recorded consent for transcript' : 'Transcript consent withdrawn', findPatient(s, a.id)!.name,
      );

    case 'callStart':
      return log(
        patch(s, a.id, { call: { phoneId: a.phoneId, secs: 0 }, pendingOutcome: null }),
        'call', `Call started: ${a.label}`, findPatient(s, a.id)!.name,
      );

    case 'callTick': {
      const entries = Object.entries(s.cases).filter(([, c]) => c.call);
      if (!entries.length) return s;
      const cases = { ...s.cases };
      for (const [id, c] of entries) {
        cases[id] = { ...c, call: { ...c.call!, secs: c.call!.secs + PLAYBACK_STEP_SECS } };
      }
      return { ...s, cases };
    }

    case 'callSkip': {
      const c = s.cases[a.id];
      const p = findPatient(s, a.id)!;
      if (!c.call) return s;
      const end = (p.transcript.at(-1)?.t ?? 0) + 5;
      return patch(s, a.id, { call: { ...c.call, secs: Math.max(c.call.secs, end) } });
    }

    case 'callEnd': {
      const c = s.cases[a.id];
      if (!c.call) return s;
      return patch(s, a.id, { call: null, pendingOutcome: c.call });
    }

    case 'callOutcome': {
      const c = s.cases[a.id];
      if (!c.pendingOutcome) return s;
      const { phoneId, secs } = c.pendingOutcome;
      const reached = a.outcome === 'Reached';
      const attempt = { at: nowOf(s).getTime(), phoneId, outcome: a.outcome, seconds: secs };
      return log(
        patch(s, a.id, {
          pendingOutcome: null,
          attempts: [...c.attempts, attempt],
          lastCallSecs: reached ? Math.max(c.lastCallSecs ?? 0, secs) : c.lastCallSecs,
        }),
        'call', `Call outcome: ${a.outcome}`, findPatient(s, a.id)!.name, a.label,
      );
    }

    case 'dictation':
      return patch(s, a.id, { dictation: a.value });

    case 'edit':
      return patch(s, a.id, { edits: { ...s.cases[a.id].edits, [a.key]: a.value } });

    case 'manual':
      return patch(s, a.id, { [a.field]: a.value });

    case 'reviewed':
      return patch(s, a.id, { reviewed: a.value });

    case 'sign': {
      const p = findPatient(s, a.id)!;
      const c = s.cases[a.id];
      const rate = editRate(p, c);
      let next = patch(s, a.id, { signed: { at: nowOf(s).getTime(), editRate: rate, trust: a.trust }, call: null });
      next = log(next, 'sign', 'Signed call note', p.name, `Edit rate ${rate}%`);
      next = log(next, 'sign', 'Signed care plan', p.name);
      next = log(next, 'sign', 'Audit form generated', p.name);
      next = log(next, 'sign', `${p.tasks.length} tasks created`, p.name, p.tasks.join('; '));
      return next;
    }

    case 'weight':
      return { ...s, weights: { ...s.weights, [a.key]: a.value } };
    case 'weightsLogged':
      return log(s, 'config', 'Score weights changed', '', Object.entries(s.weights).map(([k, v]) => `${k} ${v}`).join(', '));
    case 'weightsReset':
      return log({ ...s, weights: { ...DEFAULT_WEIGHTS } }, 'config', 'Score weights reset', '');

    case 'ai':
      return log(
        { ...s, aiEnabled: { ...s.aiEnabled, [a.feature]: a.enabled } }, 'config',
        `AI kill switch: ${a.label} ${a.enabled ? 'on' : 'off'}`, '',
      );

    case 'degraded':
      return log({ ...s, degraded: a.value }, 'config', a.value ? 'Degraded mode on' : 'Degraded mode off', '');
  }
};
