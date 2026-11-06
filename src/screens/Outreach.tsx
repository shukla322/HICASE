/** Screen 3: call once, document once, sign. Nothing reaches the record until Sign. */
import { useEffect, useRef, useState } from 'react';
import { ASSESSMENT } from '../data/assessment';
import { FEED_SHORT } from '../data/reference';
import { assessmentCounts, fieldView, type FieldView } from '../domain/assessment';
import { fmtClock, fmtDate, fmtTime } from '../domain/dates';
import {
  bestPhone, bestWindowState, contactMade, currentText, draftBaseline, editRate, effectiveConfidence,
  openMeds, sentencePending, usesDictation,
} from '../domain/rules';
import type { DraftSentence, MedRow, NoteSection, Patient, Phone, PlanItem } from '../domain/types';
import { paths } from '../state/route';
import { useStore } from '../state/store';
import {
  AuditFormDialog, DuplicateDialog, OutcomeDialog, ResolveFieldDialog, ResolveMedDialog, SignDialog,
} from '../ui/dialogs';
import { Chip, Cites, ConfidenceChip, DraftTag, FreshChip, Icon } from '../ui/parts';

const SECTIONS: { key: NoteSection; title: string }[] = [
  { key: 'S', title: 'Subjective' }, { key: 'O', title: 'Objective' },
  { key: 'A', title: 'Assessment' }, { key: 'P', title: 'Plan' },
];

type AssessFilter = 'all' | 'ask' | 'conflict';

function AutoText({ value, onChange, label, disabled }: {
  value: string; onChange: (v: string) => void; label: string; disabled: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (el) {
      el.style.height = 'auto';
      el.style.height = `${el.scrollHeight + 2}px`;
    }
  }, [value]);
  return (
    <textarea ref={ref} rows={1} className="sentence-input" aria-label={label} value={value} disabled={disabled}
      onChange={(e) => onChange(e.target.value)} />
  );
}

function CallBar({ p, phone, setPhone, onReview }: {
  p: Patient; phone: Phone; setPhone: (n: Phone) => void; onReview: () => void;
}) {
  const { state, now, dispatch } = useStore();
  const c = state.cases[p.id];
  const locked = !!c.signed;
  const blocked = !!p.duplicate && !c.duplicateDecision;
  const live = c.call;
  const win = bestWindowState(p, now);
  const conf = effectiveConfidence(phone, c);
  const start = () => dispatch({ type: 'callStart', id: p.id, phoneId: phone.id, label: `${phone.owner} ${phone.number}` });

  return (
    <section className="panel callbar" aria-label="Call">
      <div className="callbar-top">
        <div>
          <h1 tabIndex={-1}>Call {phone.owner} · {phone.number} · {phone.kind}</h1>
          <p className="muted small">
            Best {p.bestTime} · {p.language} · {phone.lastVerified ? `verified ${fmtDate(phone.lastVerified)}` : 'not verified'} · {phone.note}
          </p>
          <div className="chips-row">
            <ConfidenceChip value={conf} />
            {win.state !== 'unknown' && <Chip tone={win.state === 'now' ? 'green' : 'grey'}>{win.label}</Chip>}
          </div>
        </div>
        <div className="callbar-actions">
          <label className="check">
            <input type="checkbox" checked={c.consent} disabled={locked || !!live}
              onChange={(e) => dispatch({ type: 'consent', id: p.id, value: e.target.checked })} />
            Recorded consent for live transcript
          </label>
          {live ? (
            <div className="live">
              <button type="button" className="btn-link" onClick={() => dispatch({ type: 'callSkip', id: p.id })}>Skip to end of demo call</button>
              <button type="button" className="btn btn-danger btn-lg" onClick={() => dispatch({ type: 'callEnd', id: p.id })}>
                End call <span className="tnum" data-testid="call-timer">{fmtClock(live.secs)}</span>
              </button>
            </div>
          ) : (
            <button type="button" className="btn btn-primary btn-lg" disabled={locked || blocked} onClick={start}>
              <Icon name="phone" /> {c.attempts.length ? 'Call again' : 'Call'}
            </button>
          )}
        </div>
      </div>
      {blocked && (
        <div className="notice notice-amber notice-row" role="alert">
          <span><Icon name="alert" /> Possible duplicate record. Resolve it before outreach.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={onReview}>Review records</button>
        </div>
      )}
      {p.phones.length > 1 && (
        <fieldset className="numbers" disabled={!!live || locked}>
          <legend className="sr-only">Number to dial</legend>
          {p.phones.map((n) => {
            const nc = effectiveConfidence(n, c);
            return (
              <label className={`number${n.id === phone.id ? ' is-on' : ''}`} key={n.id}>
                <input type="radio" name="phone" checked={n.id === phone.id} onChange={() => setPhone(n)} />
                <span>
                  <strong>{n.owner}</strong> · {n.number} {n.best && <Chip tone="blue">Best number</Chip>}
                  <span className="cell-sub">
                    {n.lastVerified ? `Last verified ${fmtDate(n.lastVerified)}` : 'Never verified'} · {n.note}
                    {n.doNotDial && ' · Rules advise against redialing'}
                  </span>
                </span>
                <ConfidenceChip value={nc} />
              </label>
            );
          })}
        </fieldset>
      )}
      {c.attempts.length > 0 && (
        <ul className="attempts" aria-label="Call attempts today">
          {c.attempts.map((a) => (
            <li key={a.at + a.phoneId + a.outcome}>
              <Chip tone={a.outcome === 'Reached' ? 'green' : 'grey'}>{a.outcome}</Chip>
              {fmtTime(a.at)} · {p.phones.find((n) => n.id === a.phoneId)?.owner} · {fmtClock(a.seconds)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function AssistAndTranscript({ p, highlight }: { p: Patient; highlight: number | null }) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  const [done, setDone] = useState<Record<number, boolean>>({});
  const box = useRef<HTMLDivElement>(null);
  const played = c.call?.secs ?? c.lastCallSecs ?? 0;
  const lines = p.transcript.filter((l) => l.t <= played);

  useEffect(() => {
    if (c.call && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [lines.length, c.call]);

  useEffect(() => {
    if (highlight !== null) box.current?.querySelector(`[data-t="${highlight}"]`)?.scrollIntoView({ block: 'nearest' });
  }, [highlight]);

  return (
    <section className="card" aria-labelledby="assist-h">
      <h2 id="assist-h">Call assist</h2>
      <p className="muted small">Built from this member’s data gaps.</p>
      <ul className="checklist">
        {p.assist.map((a, i) => (
          <li key={a}>
            <label className="check">
              <input type="checkbox" checked={!!done[i]} onChange={(e) => setDone({ ...done, [i]: e.target.checked })} /> {a}
            </label>
          </li>
        ))}
      </ul>
      {c.consent ? (
        <>
          <h3 className="mini-h">Live transcript</h3>
          <div className="transcript" ref={box} tabIndex={0} role="log" aria-label="Live transcript" data-testid="transcript">
            {lines.length === 0 && <p className="muted small">The transcript starts when the call starts.</p>}
            {lines.map((l) => (
              <p key={l.t} data-t={l.t} className={highlight === l.t ? 'is-hit' : undefined}>
                <span className="tnum muted">{fmtClock(l.t)}</span> <strong>{l.speaker}:</strong> {l.text}
              </p>
            ))}
          </div>
          <p className="muted small">Demo playback runs at 20× speed.</p>
        </>
      ) : (
        <>
          <h3 className="mini-h"><label htmlFor="dictation">Dictation</label></h3>
          <p className="muted small">No recorded consent, so nothing is transcribed. Dictate what was said.</p>
          <textarea id="dictation" rows={4} value={c.dictation} disabled={!!c.signed}
            onChange={(e) => dispatch({ type: 'dictation', id: p.id, value: e.target.value })} />
        </>
      )}
    </section>
  );
}

function FieldRow({ p, v, onResolve, onMed }: {
  p: Patient; v: FieldView; onResolve: (v: FieldView) => void; onMed: () => void;
}) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  const locked = !!c.signed;
  const [draft, setDraft] = useState('');
  const commit = () => {
    if (draft.trim()) dispatch({ type: 'capture', id: p.id, field: v.name, value: draft });
  };
  return (
    <div className={`afield is-${v.status}`} data-field={v.name} data-status={v.status}>
      <span className="afield-name">{v.name}</span>
      <div className="afield-value">
        {v.status === 'prefilled' && <><span>{v.value}</span><FreshChip p={p} feed={v.feed} /></>}
        {v.status === 'captured' && (
          <>
            <span>{v.value}</span><Chip tone="green">Captured</Chip>
            {!locked && <button type="button" className="btn-link" aria-label={`Change ${v.name}`}
              onClick={() => { setDraft(v.value ?? ''); dispatch({ type: 'capture', id: p.id, field: v.name, value: '' }); }}>Change</button>}
          </>
        )}
        {v.status === 'resolved' && <><span>{v.value}</span><Chip tone="green">Resolved</Chip></>}
        {v.status === 'ask' && (
          locked ? <Chip tone="amber">Not asked</Chip> : (
            <>
              <input type="text" value={draft} placeholder={`Ask on the call${p.feeds[v.feed] ? '' : ' · unknown source'}`}
                aria-label={v.name} onChange={(e) => setDraft(e.target.value)} onBlur={commit}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commit(); } }} />
              <Chip tone="amber">Must ask</Chip>
            </>
          )
        )}
        {v.status === 'conflict' && (
          <>
            <Chip tone="red">Conflict</Chip>
            <button type="button" className="btn btn-primary btn-sm" disabled={locked} aria-label={`Resolve ${v.name}`}
              onClick={() => (v.medField ? onMed() : onResolve(v))}>Resolve</button>
          </>
        )}
      </div>
    </div>
  );
}

function Assessment({ p }: { p: Patient }) {
  const { state } = useStore();
  const c = state.cases[p.id];
  const prefill = state.aiEnabled.prefill;
  const [filter, setFilter] = useState<AssessFilter>('all');
  const [resolving, setResolving] = useState<FieldView | null>(null);
  const [med, setMed] = useState<MedRow | null>(null);
  const n = assessmentCounts(p, c, prefill);

  return (
    <section className="card" aria-labelledby="assess-h">
      <div className="card-head">
        <h2 id="assess-h">Assessment: 40 fields</h2>
      </div>
      <div className="chips-row" data-testid="assess-counts">
        <Chip tone="green">{n.prefilled} prefilled</Chip>
        <Chip tone="amber">{n.ask} to ask</Chip>
        <Chip tone="red">{n.conflict} conflicts</Chip>
        {n.settled > 0 && <Chip tone="blue">{n.settled} captured or resolved</Chip>}
      </div>
      {!prefill && <p className="notice notice-amber">Prefill is switched off in Settings.</p>}
      <div className="seg seg-sm" role="group" aria-label="Filter fields">
        {(['all', 'ask', 'conflict'] as const).map((f) => (
          <button key={f} type="button" className="seg-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
            {f === 'all' ? 'All' : f === 'ask' ? 'To ask' : 'Conflicts'}
          </button>
        ))}
      </div>
      <div className="assess-scroll" tabIndex={0} role="region" aria-label="Assessment fields">
        {ASSESSMENT.map((g) => {
          const views = g.fields.map((f) => fieldView(p, c, f, prefill)).filter((v) => filter === 'all' || v.status === filter);
          if (!views.length) return null;
          return (
            <div className="agroup" key={g.title}>
              <h3 className="mini-h">{g.title}</h3>
              {views.map((v) => <FieldRow key={v.name} p={p} v={v} onResolve={setResolving} onMed={() => setMed(openMeds(p, c)[0])} />)}
            </div>
          );
        })}
      </div>
      <p className="muted small">Each prefilled value shows its source and age. Amber must be asked. Red means sources disagree.</p>
      {resolving && <ResolveFieldDialog p={p} field={resolving.name} options={resolving.options ?? []} onClose={() => setResolving(null)} />}
      {med && <ResolveMedDialog p={p} med={med} onClose={() => setMed(null)} />}
    </section>
  );
}

function EditedTag({ d, p }: { d: DraftSentence | PlanItem; p: Patient }) {
  const { state } = useStore();
  const c = state.cases[p.id];
  return currentText(d, c).trim() !== draftBaseline(d, c).trim() ? <Chip tone="blue">Edited</Chip> : null;
}

function CarePlan({ p, onAudit }: { p: Patient; onAudit: () => void }) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  const locked = !!c.signed;
  const n = assessmentCounts(p, c, state.aiEnabled.prefill);
  return (
    <div className="stack">
      <section className="card" aria-labelledby="plan-draft-h">
        <div className="card-head">
          <h2 id="plan-draft-h">Care-plan draft</h2>
          <DraftTag confirmed={locked} label="Signed" />
        </div>
        {state.aiEnabled.plan ? p.carePlan.map((it) => (
          <div className="plan-item" key={it.id}>
            <span className="mini-label">{it.kind}</span>
            <AutoText label={`${it.kind}: care plan item`} disabled={locked} value={currentText(it, c)}
              onChange={(v) => dispatch({ type: 'edit', id: p.id, key: it.id, value: v })} />
            <div className="sentence-meta"><Cites p={p} cites={it.cites} /><EditedTag d={it} p={p} /></div>
          </div>
        )) : (
          <>
            <p className="notice notice-amber">Care-plan drafting is switched off in Settings. Write the plan below.</p>
            <textarea rows={6} aria-label="Care plan" value={c.manualPlan} disabled={locked}
              onChange={(e) => dispatch({ type: 'manual', id: p.id, field: 'manualPlan', value: e.target.value })} />
          </>
        )}
      </section>
      <section className="card" aria-labelledby="same-call-h">
        <h2 id="same-call-h">Drafted from the same call</h2>
        <ul className="plain-list">
          <li>Assessment: {n.prefilled} prefilled, {n.settled} captured or resolved</li>
          <li>Tasks: {p.tasks.join('; ')}</li>
          {p.referrals.length > 0 && <li>Referral: {p.referrals.join('; ')}</li>}
          <li>
            Audit form <button type="button" className="btn-link" onClick={onAudit}>Preview</button>
          </li>
          <li><strong>{locked ? 'Written to the record.' : 'Nothing is written to the record until signed.'}</strong></li>
        </ul>
      </section>
    </div>
  );
}

function Note({ p, onTranscript }: { p: Patient; onTranscript: (t: number) => void }) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  const locked = !!c.signed;
  const [signing, setSigning] = useState(false);
  const [blocked, setBlocked] = useState<string[]>([]);
  const n = assessmentCounts(p, c, state.aiEnabled.prefill);
  const noteOn = state.aiEnabled.note;
  const pending = noteOn ? p.note.filter((d) => sentencePending(d.cites, c)).length : 0;
  const rate = editRate(p, c);

  const trySign = () => {
    const issues: string[] = [];
    if (!contactMade(c)) issues.push('Log a reached call first.');
    if (n.conflict > 0) issues.push(`Resolve ${n.conflict} open conflict${n.conflict === 1 ? '' : 's'}. “Confirm on the call” counts.`);
    if (pending > 0) issues.push(`${pending} draft sentence${pending === 1 ? ' needs' : 's need'} the transcript or your dictation.`);
    if (!noteOn && !c.manualNote.trim()) issues.push('Write the call note.');
    if (!state.aiEnabled.plan && !c.manualPlan.trim()) issues.push('Write the care plan.');
    if (!c.reviewed) issues.push('Confirm you reviewed the draft.');
    setBlocked(issues);
    if (!issues.length) setSigning(true);
  };

  const decisions = Object.entries(c.medDecisions);

  return (
    <section className="card" aria-labelledby="note-h">
      <div className="card-head">
        <h2 id="note-h">Call note draft (SOAP)</h2>
        <DraftTag confirmed={locked} label="Signed" />
        <span className="muted small push">Each sentence cites a source or transcript time. Review, edit, sign.</span>
      </div>
      {noteOn ? (
        <div className="soap">
          {SECTIONS.map((s) => (
            <div key={s.key}>
              <h3 className="mini-h">{s.title}</h3>
              {p.note.filter((d) => d.section === s.key).map((d) => {
                const wait = sentencePending(d.cites, c);
                return (
                  <div className="sentence" key={d.id} data-sentence={d.id}>
                    {wait ? (
                      <p className="sentence-wait">
                        {c.consent ? 'Appears when the call reaches this point.' : 'Needs dictation: there is no consent for a transcript.'}
                      </p>
                    ) : (
                      <AutoText label={`${s.title} sentence`} disabled={locked} value={currentText(d, c)}
                        onChange={(v) => dispatch({ type: 'edit', id: p.id, key: d.id, value: v })} />
                    )}
                    <div className="sentence-meta">
                      <Cites p={p} cites={d.cites} onTranscript={wait ? undefined : onTranscript} dictated={usesDictation(d.cites, c)} />
                      <EditedTag d={d} p={p} />
                    </div>
                  </div>
                );
              })}
            </div>
          ))}
        </div>
      ) : (
        <>
          <p className="notice notice-amber">Note drafting is switched off in Settings. Write the note below.</p>
          <textarea rows={8} aria-label="Call note" value={c.manualNote} disabled={locked}
            onChange={(e) => dispatch({ type: 'manual', id: p.id, field: 'manualNote', value: e.target.value })} />
        </>
      )}
      {decisions.length > 0 && (
        <div className="decisions">
          <h3 className="mini-h">Your medication decisions</h3>
          <ul className="plain-list">
            {decisions.map(([drug, d]) => <li key={drug}><strong>{drug}:</strong> {d.pick}. {d.reason} <span className="cite cite-static">[Resolve log]</span></li>)}
          </ul>
        </div>
      )}
      <div className="sign-bar">
        <p>
          Edit rate: <strong className="tnum" data-testid="edit-rate">{rate}%</strong> of drafted sentences changed
          <span className="muted"> (target under 30%)</span>
        </p>
        <label className="check push">
          <input type="checkbox" checked={c.reviewed} disabled={locked}
            onChange={(e) => { dispatch({ type: 'reviewed', id: p.id, value: e.target.checked }); setBlocked([]); }} />
          I reviewed this draft
        </label>
        <button type="button" className="btn btn-primary" disabled={locked} onClick={trySign}>Approve &amp; sign</button>
      </div>
      {blocked.length > 0 && (
        <div className="notice notice-red" role="alert">
          <strong>Not ready to sign</strong>
          <ul className="plain-list">{blocked.map((b) => <li key={b}>{b}</li>)}</ul>
        </div>
      )}
      {signing && <SignDialog p={p} onClose={() => setSigning(false)} />}
    </section>
  );
}

export function Outreach({ p }: { p: Patient }) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  const [selected, setSelected] = useState<string | null>(null);
  const [dup, setDup] = useState(false);
  const [audit, setAudit] = useState(false);
  const [hit, setHit] = useState<number | null>(null);
  const phone = p.phones.find((n) => n.id === (c.call?.phoneId ?? selected)) ?? bestPhone(p);

  useEffect(() => {
    dispatch({ type: 'viewed', id: p.id, screen: 'Outreach and documentation' });
  }, [p.id, dispatch]);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a className="btn-link" href={paths.member(p.id)}><Icon name="back" size={14} /> Member 360: {p.name}</a>
        <span className="chips-row">
          {(['adt', 'pharm', 'contact'] as const).map((f) => <FreshChip key={f} p={p} feed={f} prefix={FEED_SHORT[f]} />)}
        </span>
      </nav>
      {c.signed && (
        <p className="notice notice-green" role="status" data-testid="signed-banner">
          <Icon name="check" /> Signed {fmtTime(c.signed.at)}. Note, care plan, audit form and {p.tasks.length} tasks were written to the record. Edit rate {c.signed.editRate}%.
        </p>
      )}
      <CallBar p={p} phone={phone} setPhone={(n) => setSelected(n.id)} onReview={() => setDup(true)} />
      <div className="cols3">
        <AssistAndTranscript p={p} highlight={hit} />
        <Assessment p={p} />
        <CarePlan p={p} onAudit={() => setAudit(true)} />
      </div>
      <Note p={p} onTranscript={setHit} />
      {c.pendingOutcome && <OutcomeDialog p={p} onClose={() => undefined} />}
      {dup && <DuplicateDialog p={p} onClose={() => setDup(false)} />}
      {audit && <AuditFormDialog p={p} onClose={() => setAudit(false)} />}
    </>
  );
}
