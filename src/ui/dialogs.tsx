/** Dialogs. Anything that changes the record needs a reason, checked on submit. */
import { useId, useState, type FormEvent } from 'react';
import { FEED_NAMES, RAISE_REASONS, SNOOZE_REASONS } from '../data/reference';
import { assessmentCounts } from '../domain/assessment';
import { ageDays, fmtDate, fmtDay, fmtTime } from '../domain/dates';
import {
  contactMade, currentText, editRate, fmtAge, freshness, MED_SOURCE_LABELS, rankCandidates,
  score, SIGNAL_LABELS, SIGNAL_ORDER,
} from '../domain/rules';
import type { CallOutcome, FeedKey, MedRow, OverrideKind, Patient } from '../domain/types';
import { findPatient } from '../state/reducer';
import { useStore } from '../state/store';
import { Chip, FormError, Modal } from './parts';

const FORM_ID = 'modal-form';

function ModalActions({ cancel, submit, onCancel }: { cancel?: string; submit: string; onCancel: () => void }) {
  return (
    <>
      <button type="button" className="btn btn-ghost" onClick={onCancel}>{cancel ?? 'Cancel'}</button>
      <button type="submit" form={FORM_ID} className="btn btn-primary">{submit}</button>
    </>
  );
}

function ReasonField({ value, onChange, invalid, label = 'Reason (required)', placeholder }: {
  value: string; onChange: (v: string) => void; invalid: boolean; label?: string; placeholder?: string;
}) {
  const id = useId();
  return (
    <div className="field">
      <label htmlFor={id}>{label}</label>
      <textarea id={id} rows={2} value={value} placeholder={placeholder} aria-required="true"
        aria-invalid={invalid} onChange={(e) => onChange(e.target.value)} />
    </div>
  );
}

/* ---------- Q4: score breakdown ---------- */

export function ScoreDialog({ p, onClose }: { p: Patient; onClose: () => void }) {
  const { state } = useStore();
  const w = state.weights;
  return (
    <Modal title={`Score ${score(p.signals, w)}: ${p.name}`} onClose={onClose}
      subtitle="Score = sum of weight × signal strength (0 to 1), rounded. Weights are starting values, tuned in pilot."
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      <div className="table-wrap">
        <table className="table">
          <caption className="sr-only">Score breakdown by signal</caption>
          <thead>
            <tr><th scope="col">Signal</th><th scope="col" className="num">Weight</th><th scope="col" className="num">Strength</th><th scope="col" className="num">Points</th></tr>
          </thead>
          <tbody>
            {SIGNAL_ORDER.map((k) => (
              <tr key={k}>
                <th scope="row">
                  {SIGNAL_LABELS[k]}
                  <span className="cell-sub">{p.signalWhy[k]}</span>
                </th>
                <td className="num">{w[k]}</td>
                <td className="num">{p.signals[k].toFixed(2)}</td>
                <td className="num"><strong>{(w[k] * p.signals[k]).toFixed(2)}</strong></td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <th scope="row">Total</th>
              <td className="num">{SIGNAL_ORDER.reduce((n, k) => n + w[k], 0)}</td>
              <td />
              <td className="num"><strong>{SIGNAL_ORDER.reduce((n, k) => n + w[k] * p.signals[k], 0).toFixed(2)}</strong></td>
            </tr>
          </tfoot>
        </table>
      </div>
      <p className="muted small">Signal strengths are the author’s assumptions, reproduced from the Excel annex. Stale data lowers a signal, and the “why” under each signal says what drove it.</p>
    </Modal>
  );
}

/* ---------- Q6: snooze or override ---------- */

export function OverrideDialog({ p, onClose }: { p: Patient; onClose: () => void }) {
  const { dispatch, toast } = useStore();
  const [kind, setKind] = useState<OverrideKind>('snooze');
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const selectId = useId();
  const noteId = useId();
  const errId = useId();
  const reasons = kind === 'top' ? RAISE_REASONS : SNOOZE_REASONS;

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!reason) {
      setError('Choose a reason. Every snooze or override is logged.');
      return;
    }
    dispatch({ type: 'override', id: p.id, kind, reason, note: note.trim() || undefined });
    toast(`${p.name}: override logged`);
    onClose();
  };

  return (
    <Modal title="Snooze or override rank" subtitle={`${p.name}. A reason is required and logged.`} onClose={onClose}
      footer={<ModalActions submit="Apply and log" onCancel={onClose} />}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <fieldset className="options">
          <legend>Action</legend>
          {([['snooze', 'Snooze', 'Moves to the bottom and leaves today’s capacity'], ['lower', 'Move down', 'Stays on today’s list below the ranked cases'], ['top', 'Move to top', 'Pins above the ranked cases']] as const).map(([k, label, hint]) => (
            <label className="option" key={k}>
              <input type="radio" name="kind" checked={kind === k} onChange={() => { setKind(k); setReason(''); }} />
              <span>{label}<span className="cell-sub">{hint}</span></span>
            </label>
          ))}
        </fieldset>
        <div className="field">
          <label htmlFor={selectId}>Reason (required)</label>
          <select id={selectId} value={reason} aria-required="true" aria-invalid={!!error} aria-describedby={errId}
            onChange={(e) => { setReason(e.target.value); setError(''); }}>
            <option value="">Choose a reason</option>
            {reasons.map((r) => <option key={r}>{r}</option>)}
          </select>
        </div>
        <FormError id={errId}>{error}</FormError>
        <div className="field">
          <label htmlFor={noteId}>Note (optional)</label>
          <textarea id={noteId} rows={2} value={note} onChange={(e) => setNote(e.target.value)} />
        </div>
      </form>
    </Modal>
  );
}

/* ---------- M4: medication resolve ---------- */

export function ResolveMedDialog({ p, med, onClose }: { p: Patient; med: MedRow; onClose: () => void }) {
  const { dispatch, toast, now } = useStore();
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const errId = useId();
  const ranked = rankCandidates(med, now);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pick || !reason.trim()) {
      setError(!pick ? 'Choose a value or a next step.' : 'State a reason. Resolving is audit-logged.');
      return;
    }
    dispatch({ type: 'resolveMed', id: p.id, drug: med.drug, decision: { pick, reason: reason.trim() } });
    toast(`${med.drug} resolved and logged`);
    onClose();
  };

  return (
    <Modal title={`Resolve ${med.drug}`} onClose={onClose}
      subtitle="Sources are ranked by recency × reliability × fill evidence. The rank is a suggestion: nothing resolves until you choose."
      footer={<ModalActions submit="Resolve and log" onCancel={onClose} />}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <fieldset className="options">
          <legend>Decision</legend>
          {ranked.map((c, i) => {
            const label = `${c.value} (${MED_SOURCE_LABELS[c.source]})`;
            return (
              <label className="option" key={c.source}>
                <input type="radio" name="pick" checked={pick === label} onChange={() => { setPick(label); setError(''); }} />
                <span>
                  {label}
                  <span className="cell-sub">
                    {c.date ? `${fmtDate(c.date)} · ${fmtAge(ageDays(c.date, now))} old` : 'Date unknown'} · rule strength {Math.round(c.strength * 100)}
                    {i === 0 && ranked.length > 1 ? ' · highest rank, not applied' : ''}
                  </span>
                </span>
              </label>
            );
          })}
          {(med.options ?? []).map((o) => (
            <label className="option" key={o}>
              <input type="radio" name="pick" checked={pick === o} onChange={() => { setPick(o); setError(''); }} />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
        <ReasonField value={reason} onChange={(v) => { setReason(v); setError(''); }} invalid={!!error} placeholder="Why this is right" />
        <FormError id={errId}>{error}</FormError>
      </form>
    </Modal>
  );
}

/* ---------- O3: field conflict ---------- */

export function ResolveFieldDialog({ p, field, options, onClose }: { p: Patient; field: string; options: string[]; onClose: () => void }) {
  const { dispatch, toast } = useStore();
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const errId = useId();
  const choices = [...options, 'Confirm on the call'];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pick || !reason.trim()) {
      setError(!pick ? 'Choose a value.' : 'State a reason. Resolving is audit-logged.');
      return;
    }
    dispatch({ type: 'resolveField', id: p.id, field, decision: { pick, reason: reason.trim() } });
    toast(`${field}: resolved and logged`);
    onClose();
  };

  return (
    <Modal title={`Resolve: ${field}`} subtitle="Two sources disagree. Nothing resolves on its own." onClose={onClose}
      footer={<ModalActions submit="Resolve and log" onCancel={onClose} />}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <fieldset className="options">
          <legend>Decision</legend>
          {choices.map((o) => (
            <label className="option" key={o}>
              <input type="radio" name="pick" checked={pick === o} onChange={() => { setPick(o); setError(''); }} />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
        <ReasonField value={reason} onChange={(v) => { setReason(v); setError(''); }} invalid={!!error} />
        <FormError id={errId}>{error}</FormError>
      </form>
    </Modal>
  );
}

/* ---------- duplicate review ---------- */

export function DuplicateDialog({ p, onClose, onDone }: { p: Patient; onClose: () => void; onDone?: () => void }) {
  const { dispatch, toast } = useStore();
  const [pick, setPick] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');
  const errId = useId();
  const dup = p.duplicate!;
  const choices = [`Merge into ${p.memberId}`, 'Not a duplicate'];

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!pick || !reason.trim()) {
      setError(!pick ? 'Choose a decision.' : 'State a reason. This decision is audit-logged.');
      return;
    }
    dispatch({ type: 'duplicate', id: p.id, decision: { pick, reason: reason.trim() } });
    toast('Merge decision logged');
    onClose();
    onDone?.();
  };

  return (
    <Modal title="Possible duplicate record" subtitle="Only a clinician merges. HiCase never merges on its own." onClose={onClose}
      footer={<ModalActions submit="Confirm decision" onCancel={onClose} />}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Compare the two member records</caption>
            <thead><tr><th scope="col">Field</th><th scope="col">{p.memberId}</th><th scope="col">{dup.otherId}</th></tr></thead>
            <tbody>
              {dup.rows.map((r) => (
                <tr key={r.field}>
                  <th scope="row">{r.field}</th>
                  <td>{r.a}</td>
                  <td className={r.differs ? 'cell-conflict' : undefined}>{r.b}{r.differs && <span className="cell-sub">Differs</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <fieldset className="options">
          <legend>Decision</legend>
          {choices.map((o) => (
            <label className="option" key={o}>
              <input type="radio" name="pick" checked={pick === o} onChange={() => { setPick(o); setError(''); }} />
              <span>{o}</span>
            </label>
          ))}
        </fieldset>
        <ReasonField value={reason} onChange={(v) => { setReason(v); setError(''); }} invalid={!!error} />
        <FormError id={errId}>{error}</FormError>
      </form>
    </Modal>
  );
}

/* ---------- call outcome ---------- */

const OUTCOMES: { value: CallOutcome; hint: string }[] = [
  { value: 'Reached', hint: 'A real conversation; counts as contact' },
  { value: 'Voicemail', hint: 'Attempt logged; the clock keeps running' },
  { value: 'No answer', hint: 'Attempt logged; the clock keeps running' },
  { value: 'Wrong number', hint: 'Number drops to confidence None' },
  { value: 'Disconnected', hint: 'Number drops to confidence None' },
];

export function OutcomeDialog({ p, onClose }: { p: Patient; onClose: () => void }) {
  const { state, dispatch } = useStore();
  const [outcome, setOutcome] = useState<CallOutcome | ''>('');
  const [error, setError] = useState('');
  const errId = useId();
  const pending = state.cases[p.id].pendingOutcome;
  const phone = p.phones.find((n) => n.id === pending?.phoneId);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!outcome) {
      setError('Choose an outcome. It teaches the best-contact rules.');
      return;
    }
    dispatch({ type: 'callOutcome', id: p.id, outcome, label: phone ? `${phone.owner} ${phone.number}` : '' });
    onClose();
  };

  return (
    <Modal title="How did the call go?" subtitle={phone ? `${phone.owner} · ${phone.number}` : undefined} onClose={onClose} required
      footer={<button type="submit" form={FORM_ID} className="btn btn-primary">Log outcome</button>}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <fieldset className="options">
          <legend>Outcome</legend>
          {OUTCOMES.map((o) => (
            <label className="option" key={o.value}>
              <input type="radio" name="outcome" checked={outcome === o.value} onChange={() => { setOutcome(o.value); setError(''); }} />
              <span>{o.value}<span className="cell-sub">{o.hint}</span></span>
            </label>
          ))}
        </fieldset>
        <FormError id={errId}>{error}</FormError>
      </form>
    </Modal>
  );
}

/* ---------- O6: audit form and sign ---------- */

export function AuditFormDialog({ p, onClose }: { p: Patient; onClose: () => void }) {
  const { state, now } = useStore();
  const c = state.cases[p.id];
  const n = assessmentCounts(p, c, state.aiEnabled.prefill);
  const made = contactMade(c);
  const reached = c.attempts.find((a) => a.outcome === 'Reached');
  const phone = p.phones.find((x) => x.id === reached?.phoneId);
  const rows: [string, string][] = [
    ['Member', `${p.name} · ${p.memberId} · ${p.plan}`],
    ['Program', p.program],
    ['Contact', made ? `${fmtDay(new Date(made))}, ${fmtTime(made)}` : 'Not yet reached'],
    ['Person reached', phone ? phone.owner : 'Not yet reached'],
    ['Attempts', String(c.attempts.length)],
    ['Transcript consent', c.consent ? 'Recorded' : 'Not recorded; dictation used'],
    ['Assessment', `${n.prefilled} prefilled, ${n.settled} captured or resolved, ${n.ask} open, ${n.conflict} conflicts`],
    ['Medications resolved', Object.keys(c.medDecisions).join(', ') || 'None yet'],
    ['Referrals', p.referrals.join(', ') || 'None'],
    ['Status', c.signed ? `Signed ${fmtTime(c.signed.at)}` : `DRAFT as of ${fmtTime(now)}`],
  ];
  return (
    <Modal title="Audit form" subtitle="Accreditor format, filled from the same call." onClose={onClose}
      footer={<button type="button" className="btn btn-primary" onClick={onClose}>Done</button>}>
      <dl className="kv">
        {rows.map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </Modal>
  );
}

export function SignDialog({ p, onClose }: { p: Patient; onClose: () => void }) {
  const { state, dispatch, toast } = useStore();
  const [trust, setTrust] = useState<number | null>(null);
  const c = state.cases[p.id];
  const n = assessmentCounts(p, c, state.aiEnabled.prefill);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    dispatch({ type: 'sign', id: p.id, trust });
    toast('Signed. Written to the record.');
    onClose();
  };

  return (
    <Modal title="Approve and sign" subtitle={`This writes to ${p.name}’s record. It cannot be undone here.`} onClose={onClose}
      footer={<ModalActions submit="Sign and write to record" onCancel={onClose} />}>
      <form id={FORM_ID} onSubmit={submit} noValidate>
        <ul className="plain-list">
          <li>Call note ({p.note.length} sentences, edit rate {editRate(p, c)}%)</li>
          <li>Care plan ({p.carePlan.length} items)</li>
          <li>Assessment and audit form</li>
          <li>{p.tasks.length} tasks: {p.tasks.join('; ')}</li>
          {p.referrals.length > 0 && <li>Referrals: {p.referrals.join('; ')}</li>}
        </ul>
        {n.ask > 0 && <p className="notice notice-amber">{n.ask} assessment fields are still unanswered. They stay open for the next contact.</p>}
        <fieldset className="options">
          <legend>How far did you trust these drafts? (optional)</legend>
          <div className="rating">
            {[1, 2, 3, 4, 5].map((v) => (
              <label key={v} className={`rating-item${trust === v ? ' is-on' : ''}`}>
                <input type="radio" name="trust" className="sr-only" checked={trust === v} onChange={() => setTrust(v)} />
                {v}
              </label>
            ))}
          </div>
          <span className="cell-sub">1 is not at all, 5 is completely.</span>
        </fieldset>
      </form>
    </Modal>
  );
}

/* ---------- M8: raw source drawer ---------- */

const TABS: { key: FeedKey | 'all'; label: string }[] = [
  { key: 'all', label: 'All' }, { key: 'claims', label: 'Claims' }, { key: 'notes', label: 'Notes' },
  { key: 'labs', label: 'Labs' }, { key: 'pharm', label: 'Pharmacy' }, { key: 'adt', label: 'ADT' },
];

export function SourceDrawer() {
  const { state, sources, closeSources, now } = useStore();
  const [tab, setTab] = useState<FeedKey | 'all' | null>(null);
  const p = sources ? findPatient(state, sources.id) : undefined;
  if (!sources || !p) return null;

  const active = tab ?? sources.feed ?? 'all';
  const c = state.cases[p.id];
  const records = p.records.filter((r) => active === 'all' || r.feed === active);
  const close = () => { setTab(null); closeSources(); };
  const tabs = TABS.some((t) => t.key === active) ? TABS : [...TABS, { key: active, label: FEED_NAMES[active as FeedKey] }];

  return (
    <Modal side title="Source records" subtitle={`${p.name} · ${p.memberId}`} onClose={close}>
      <div className="seg" role="group" aria-label="Filter source records">
        {tabs.map((t) => (
          <button key={t.key} type="button" className="seg-btn" aria-pressed={active === t.key} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      {c.signed && (active === 'all' || active === 'notes') && (
        <article className="record">
          <header><strong>Signed call note</strong><Chip tone="green">Signed {fmtTime(c.signed.at)}</Chip></header>
          <p>{c.manualNote || p.note.map((d) => currentText(d, c)).join(' ')}</p>
        </article>
      )}
      {records.length === 0 && <p className="muted">No record from this source: shown as unknown, not as none.</p>}
      {records.map((r) => {
        const age = r.date ? ageDays(r.date, now) : null;
        const tone = freshness(age);
        return (
          <article className="record" key={`${r.feed}-${r.text}`}>
            <header>
              <strong>{FEED_NAMES[r.feed]}</strong>
              <Chip tone={tone}>{r.date ? `${fmtDate(r.date)} · ${fmtAge(age)}` : 'Date unknown'}</Chip>
            </header>
            <p>{r.text}</p>
            {r.note && <p className="muted small">{r.note}</p>}
          </article>
        );
      })}
    </Modal>
  );
}

