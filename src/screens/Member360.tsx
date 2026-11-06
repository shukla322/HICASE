/** Screen 2: one page that replaces six to seven screens. */
import { useEffect, useState } from 'react';
import { ageDays, fmtDate, toIso } from '../domain/dates';
import {
  bestWindowState, clockView, effectiveConfidence, freshness, MED_SOURCE_LABELS, MED_SOURCE_ORDER,
  openMeds, supplyEnd, supplyGapDays,
} from '../domain/rules';
import type { MedRow, MedSourceKey, Patient, TimelineEvent } from '../domain/types';
import { FEED_SHORT } from '../data/reference';
import { paths } from '../state/route';
import { useStore } from '../state/store';
import { DuplicateDialog, ResolveMedDialog } from '../ui/dialogs';
import { Chip, Cites, ConfidenceChip, DraftTag, FreshChip, Icon } from '../ui/parts';

function Ribbon({ p }: { p: Patient }) {
  const { state, now } = useStore();
  const clock = clockView(p, state.cases[p.id], now);
  const tone = clock.tone === 'red' ? 'red' : clock.tone === 'done' ? 'green' : clock.tone === 'amber' ? 'amber' : 'blue';
  const visit = clock.sub?.split(' · ').find((x) => x.startsWith('Visit'));
  return (
    <section className="ribbon" aria-label="Member identity">
      <div>
        <h1 tabIndex={-1}>{p.name}</h1>
        <p>
          {p.age} {p.sex} · {p.plan} · {p.program} · {p.condition} · {p.language} · {p.memberId} · PCP {p.pcp}
        </p>
      </div>
      <div className="ribbon-chips">
        <Chip tone={tone}>{clock.label}</Chip>
        {visit && <Chip tone="blue">{visit}</Chip>}
      </div>
    </section>
  );
}

function Brief({ p }: { p: Patient }) {
  const { state, dispatch } = useStore();
  const c = state.cases[p.id];
  if (!state.aiEnabled.brief) {
    return (
      <section className="card" aria-labelledby="brief-h">
        <h2 id="brief-h">AI brief</h2>
        <p className="muted">The AI brief is switched off in Settings. Use the source records below.</p>
      </section>
    );
  }
  return (
    <section className="card" aria-labelledby="brief-h">
      <div className="card-head">
        <h2 id="brief-h">AI brief</h2>
        <DraftTag confirmed={c.briefConfirmed} />
        <button type="button" className={`btn ${c.briefConfirmed ? 'btn-ghost' : 'btn-primary'} btn-sm push`}
          onClick={() => dispatch({ type: 'briefConfirm', id: p.id, confirmed: !c.briefConfirmed })}>
          {c.briefConfirmed ? 'Return to draft' : 'Confirm brief'}
        </button>
      </div>
      <ul className="brief">
        {p.brief.map((b) => <li key={b.text}>{b.text} <Cites p={p} cites={b.cites} /></li>)}
      </ul>
    </section>
  );
}

function Risks({ p }: { p: Patient }) {
  return (
    <section aria-labelledby="risks-h">
      <h2 id="risks-h" className="sr-only">Top 3 risks</h2>
      <div className="risks">
        {p.risks.map((r) => (
          <article className="card risk" key={r.title}>
            <h3>{r.title}</h3>
            <p className="small">{r.detail}</p>
            <FreshChip p={p} feed={r.feed} qualifier={r.qualifier} />
          </article>
        ))}
      </div>
    </section>
  );
}

function MedCell({ p, med, source }: { p: Patient; med: MedRow; source: MedSourceKey }) {
  const { now } = useStore();
  const s = med.sources[source];
  if (!s) {
    const unknown = source === 'ccd' && !p.feeds.ccd;
    return <span className="muted">{unknown ? 'No CCD: unknown' : 'n/a'}</span>;
  }
  if (source !== 'pharm') {
    return <>{s.value}{s.date && <span className="cell-sub">{fmtDate(s.date)}</span>}</>;
  }
  const gap = med.fill ? supplyGapDays(med.fill, now) : 0;
  return (
    <>
      {s.value}{s.date && <span className="cell-sub">last fill {fmtDate(s.date)}</span>}
      {med.fill && gap > 0 && (
        <span className="cell-sub" title="Cash or discount-card fills are not visible to the PBM">
          Supply ended {fmtDate(supplyEnd(med.fill))} · <strong>probable gap {gap} d</strong>
        </span>
      )}
    </>
  );
}

function Meds({ p }: { p: Patient }) {
  const { state } = useStore();
  const c = state.cases[p.id];
  const [resolving, setResolving] = useState<MedRow | null>(null);
  const open = openMeds(p, c).length;
  const shown = MED_SOURCE_ORDER.filter((k) => k !== 'notes' || p.meds.some((m) => m.sources.notes));

  return (
    <section className="card" id="medication-panel" aria-labelledby="meds-h">
      <div className="card-head">
        <h2 id="meds-h">Medication reconciliation</h2>
        {p.meds.length > 0 && <Chip tone={open ? 'amber' : 'green'}>{open ? `${open} to resolve` : 'All resolved'}</Chip>}
      </div>
      {p.meds.length === 0 ? (
        <p className="muted">No medication source has arrived yet. Shown as unknown, not as none.</p>
      ) : (
        <div className="table-wrap" tabIndex={0} role="region" aria-label="Medication sources side by side">
          <table className="table meds">
            <caption className="sr-only">Medication sources side by side</caption>
            <thead>
              <tr>
                <th scope="col">Drug</th>
                {shown.map((k) => <th scope="col" key={k}>{MED_SOURCE_LABELS[k]}</th>)}
                <th scope="col">Decision</th>
              </tr>
            </thead>
            <tbody>
              {p.meds.map((m) => {
                const decision = c.medDecisions[m.drug];
                const flag = !decision && m.status !== 'match' ? (m.status === 'conflict' ? 'cell-conflict' : 'cell-check') : undefined;
                return (
                  <tr key={m.drug} data-drug={m.drug}>
                    <th scope="row">{m.drug}</th>
                    {shown.map((k) => (
                      <td key={k} className={m.sources[k] ? flag : undefined}><MedCell p={p} med={m} source={k} /></td>
                    ))}
                    <td>
                      {m.status === 'match' ? (
                        <Chip tone="green"><Icon name="check" size={12} /> Match</Chip>
                      ) : decision ? (
                        <>
                          <Chip tone="green"><Icon name="check" size={12} /> Resolved</Chip>
                          <span className="cell-sub"><strong>{decision.pick}</strong></span>
                          <span className="cell-sub">{decision.reason}</span>
                        </>
                      ) : (
                        <div className="decide">
                          <Chip tone={m.status === 'conflict' ? 'red' : 'amber'}>{m.status === 'conflict' ? 'Conflict' : 'Check'}</Chip>
                          <button type="button" className="btn btn-primary btn-sm" onClick={() => setResolving(m)}
                            aria-label={`Resolve ${m.drug}`}>Resolve</button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className="muted small">
        Sources compare in order of authority: discharge CCD, pharmacy fills, claims, old notes. Nothing auto-resolves.
        Cash fills are invisible to the PBM, so a missing fill is a “probable gap”, never a verdict on the member.
      </p>
      {resolving && <ResolveMedDialog p={p} med={resolving} onClose={() => setResolving(null)} />}
    </section>
  );
}

function Timeline({ p }: { p: Patient }) {
  const { now } = useStore();
  const today: TimelineEvent = { date: toIso(now), label: 'Today', feed: 'adt' };
  const events = [...p.timeline].sort((a, b) => a.date.localeCompare(b.date));
  const all = [...events, today];
  const claimIndex = all.findIndex((e) => e.lastClaim);
  const claimAge = p.lastClaim ? ageDays(p.lastClaim, now) : null;

  return (
    <section className="card" aria-labelledby="timeline-h">
      <div className="card-head">
        <h2 id="timeline-h">Timeline</h2>
        <span className="muted small">ADT outranks claims</span>
      </div>
      <div className="timeline-scroll" tabIndex={0} role="region" aria-label="Member timeline">
        <ol className="timeline" style={{ gridTemplateColumns: `repeat(${all.length}, minmax(112px, 1fr))` }}>
          {all.map((e, i) => (
            <li key={`${e.date}-${e.label}`} className={`tl-event${i === all.length - 1 ? ' is-today' : ''}${e.feed === 'adt' ? ' is-adt' : ''}`}>
              <strong>{fmtDate(e.date)}</strong>
              <span>{e.label}</span>
              {i < all.length - 1 && <span className="cell-sub">{FEED_SHORT[e.feed]}</span>}
            </li>
          ))}
          {claimIndex >= 0 && (
            <li className="tl-blind" aria-hidden="true" style={{ gridColumn: `${claimIndex + 1} / -1` }} />
          )}
        </ol>
      </div>
      <p className="blind-label" data-testid="blind-spot">
        {p.lastClaim
          ? <>Claims blind spot: last claim {fmtDate(p.lastClaim)}, {claimAge} days old</>
          : <>Claims: none received yet, shown as unknown</>}
      </p>
    </section>
  );
}

function CallPlanCard({ p }: { p: Patient }) {
  const { state, now } = useStore();
  const c = state.cases[p.id];
  const win = bestWindowState(p, now);
  return (
    <section className="card card-accent" aria-labelledby="plan-h">
      <h2 id="plan-h">Call plan</h2>
      <dl className="kv kv-tight">
        <div><dt>Who</dt><dd>{p.callPlan.who}</dd></div>
        <div><dt>Best time</dt><dd>{p.bestTime}{win.state !== 'unknown' && <span className="cell-sub">{win.label}</span>}</dd></div>
        <div><dt>Language</dt><dd>{p.callPlan.language}</dd></div>
        <div><dt>Book</dt><dd>{p.callPlan.book}</dd></div>
      </dl>
      <h3 className="mini-h">What the data cannot answer</h3>
      <ul className="plain-list">{p.callPlan.asks.map((a) => <li key={a}>{a}</li>)}</ul>
      {p.callPlan.addresses && (
        <>
          <h3 className="mini-h">Addresses disagree</h3>
          <ul className="plain-list">
            {p.callPlan.addresses.map((a) => <li key={a.label}>{a.label}: {a.value} <FreshChip p={p} feed={a.feed} /></li>)}
          </ul>
        </>
      )}
      {p.callPlan.fallback && <p className="small muted">{p.callPlan.fallback}</p>}
      <div className="chips-row">
        {p.phones.map((n) => (
          <ConfidenceChip key={n.id} value={effectiveConfidence(n, c)} prefix={n.owner.split(' (')[0].split(',')[0]} />
        ))}
      </div>
      <a className="btn btn-primary btn-block" href={paths.outreach(p.id)}><Icon name="phone" /> Start call and documentation</a>
    </section>
  );
}

function Sdoh({ p }: { p: Patient }) {
  const { now } = useStore();
  const age = p.sdoh.date ? ageDays(p.sdoh.date, now) : null;
  return (
    <section className="card" aria-labelledby="sdoh-h">
      <div className="card-head">
        <h2 id="sdoh-h">SDOH</h2>
        <FreshChip p={p} feed="sdoh" prefix="Screened" />
      </div>
      <p>{p.sdoh.text}</p>
      {freshness(age) !== 'green' && <p className="prompt"><Icon name="alert" size={14} /> Re-screen on this call</p>}
    </section>
  );
}

export function Member360({ p }: { p: Patient }) {
  const { state, dispatch, openSources } = useStore();
  const c = state.cases[p.id];
  const [dup, setDup] = useState(false);

  useEffect(() => {
    dispatch({ type: 'viewed', id: p.id, screen: 'Member 360' });
  }, [p.id, dispatch]);

  return (
    <>
      <nav className="crumbs" aria-label="Breadcrumb">
        <a className="btn-link" href={paths.queue}><Icon name="back" size={14} /> Queue</a>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => openSources(p.id)}>
          <Icon name="layers" /> Raw claims, notes, labs
        </button>
      </nav>
      <Ribbon p={p} />
      {p.duplicate && !c.duplicateDecision && (
        <div className="notice notice-amber notice-row" role="alert">
          <span><Icon name="alert" /> Possible duplicate record ({p.memberId} and {p.duplicate.otherId}). Resolve before outreach.</span>
          <button type="button" className="btn btn-primary btn-sm" onClick={() => setDup(true)}>Review records</button>
        </div>
      )}
      {c.duplicateDecision && (
        <p className="notice notice-green"><Icon name="check" /> Merge review: {c.duplicateDecision.pick}. {c.duplicateDecision.reason}</p>
      )}
      <div className="m360">
        <div className="stack">
          <Brief p={p} />
          <Risks p={p} />
          <Meds p={p} />
          <Timeline p={p} />
        </div>
        <div className="stack">
          <CallPlanCard p={p} />
          <Sdoh p={p} />
          <section className="card" aria-labelledby="loops-h">
            <h2 id="loops-h">Open loops</h2>
            <ul className="plain-list">{p.loops.map((l) => <li key={l}>{l}</li>)}</ul>
          </section>
          <section className="card" aria-labelledby="fresh-h">
            <h2 id="fresh-h">Freshness by source</h2>
            <div className="chips-row">
              {(['adt', 'pharm', 'claims', 'um', 'appt', 'sdoh', 'notes', 'contact', 'ccd'] as const).map((f) => (
                <FreshChip key={f} p={p} feed={f} />
              ))}
            </div>
            <p className="muted small">Green 2 days or less · amber 3 to 14 days · red over 14 days or unknown.</p>
          </section>
        </div>
      </div>
      {dup && <DuplicateDialog p={p} onClose={() => setDup(false)} />}
    </>
  );
}

