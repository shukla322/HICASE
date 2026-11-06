/** Supporting pages: Members, Reports, Audit and Settings. */
import { useState } from 'react';
import { AUTOMATION, DATASETS, METRICS, TIME_BUDGET } from '../data/reference';
import { fmtTime } from '../domain/dates';
import {
  clockView, contactMade, DEFAULT_WEIGHTS, score, SIGNAL_LABELS, SIGNAL_ORDER, tcmClock,
} from '../domain/rules';
import type { AiFeature, AuditEntry, AuditKind } from '../domain/types';
import { allPatients } from '../state/reducer';
import { paths } from '../state/route';
import { useStore } from '../state/store';
import { Chip, FreshChip, Icon } from '../ui/parts';

/* ---------- Members ---------- */

export function Members() {
  const { state, now } = useStore();
  const [q, setQ] = useState('');
  const list = allPatients(state).filter((p) =>
    `${p.name} ${p.tags} ${p.memberId} ${p.plan}`.toLowerCase().includes(q.trim().toLowerCase()));
  return (
    <>
      <div className="page-head">
        <div>
          <h1 tabIndex={-1}>Members</h1>
          <p className="muted">Everyone on today’s list. Open a member for the full picture.</p>
        </div>
        <label className="search">
          <Icon name="search" />
          <span className="sr-only">Search members</span>
          <input type="search" value={q} placeholder="Name, plan or member ID" onChange={(e) => setQ(e.target.value)} />
        </label>
      </div>
      <div className="panel panel-flush">
        <div className="table-wrap">
          <table className="table table-roomy">
            <caption className="sr-only">Members</caption>
            <thead><tr><th scope="col">Member</th><th scope="col">Program</th><th scope="col">Clock</th><th scope="col" className="num">Score</th><th scope="col">Data</th></tr></thead>
            <tbody>
              {list.map((p) => (
                <tr key={p.id}>
                  <th scope="row">
                    <a className="member-link" href={paths.member(p.id)}>{p.name}, {p.age} {p.sex}</a>
                    <span className="cell-sub">{p.memberId} · {p.plan}</span>
                  </th>
                  <td>{p.program}</td>
                  <td>{clockView(p, state.cases[p.id], now).label}</td>
                  <td className="num"><strong>{score(p.signals, state.weights)}</strong></td>
                  <td><div className="chips-row">{p.rowFeeds.map((f) => <FreshChip key={f} p={p} feed={f} />)}</div></td>
                </tr>
              ))}
              {list.length === 0 && <tr><td colSpan={5} className="empty">No members match that search.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}

/* ---------- Reports ---------- */

const CHART_MAX = 250;

function TimeBudgetChart() {
  const [table, setTable] = useState(false);
  return (
    <section className="card" aria-labelledby="budget-h">
      <div className="card-head">
        <h2 id="budget-h">Where the 450-minute day goes</h2>
        <button type="button" className="btn btn-ghost btn-sm push" aria-pressed={table} onClick={() => setTable(!table)}>
          {table ? 'Show chart' : 'Show table'}
        </button>
      </div>
      <p className="muted small">Minutes per case manager per day. Estimated; replaced by the week-0 time-and-motion study. The target is an upper bound.</p>
      {table ? (
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Minutes by bucket, today and MVP target</caption>
            <thead><tr><th scope="col">Bucket</th><th scope="col" className="num">Today</th><th scope="col" className="num">MVP target</th><th scope="col">Mechanism</th></tr></thead>
            <tbody>
              {TIME_BUDGET.map((r) => (
                <tr key={r.bucket}><th scope="row">{r.bucket}</th><td className="num">{r.today}</td><td className="num">{r.target}</td><td>{r.mechanism}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <ul className="legend" aria-label="Legend">
            <li><span className="swatch swatch-today" /> Today</li>
            <li><span className="swatch swatch-target" /> MVP target</li>
          </ul>
          <div className="bars" role="img"
            aria-label={TIME_BUDGET.map((r) => `${r.bucket}: ${r.today} minutes today, ${r.target} target`).join('. ')}>
            {TIME_BUDGET.map((r) => (
              <div className="bar-row" key={r.bucket}>
                <span className="bar-label">{r.bucket}</span>
                <div className="bar-pair">
                  {(['today', 'target'] as const).map((k) => (
                    <div className="bar-line" key={k}>
                      <span className={`bar bar-${k}`} style={{ width: `${(r[k] / CHART_MAX) * 100}%` }} />
                      <span className="bar-val tnum">{r[k]}</span>
                    </div>
                  ))}
                </div>
                <span className="bar-tip" role="presentation">{r.mechanism}</span>
              </div>
            ))}
          </div>
        </>
      )}
    </section>
  );
}

function Stat({ value, label, sub }: { value: string; label: string; sub: string }) {
  return (
    <div className="card stat">
      <p className="stat-label">{label}</p>
      <p className="stat-value tnum">{value}</p>
      <p className="muted small">{sub}</p>
    </div>
  );
}

export function Reports() {
  const { state } = useStore();
  const patients = allPatients(state);
  const cases = patients.map((p) => ({ p, c: state.cases[p.id] }));
  const attempts = cases.flatMap(({ c }) => c.attempts);
  const reached = attempts.filter((a) => a.outcome === 'Reached');
  const talkMin = Math.round(reached.reduce((n, a) => n + a.seconds, 0) / 60);
  const signed = cases.filter(({ c }) => c.signed);
  const rates = signed.map(({ c }) => c.signed!.editRate);
  const trusts = signed.flatMap(({ c }) => (c.signed!.trust ? [c.signed!.trust] : []));
  const avg = (xs: number[]) => xs.reduce((a, b) => a + b, 0) / xs.length;
  const clocked = cases.filter(({ p }) => p.discharge);
  const onTime = clocked.filter(({ p, c }) => {
    const made = contactMade(c);
    return made !== null && made <= tcmClock(p.discharge!).contactDue.getTime();
  });
  const overrides = state.audit.filter((a) => a.kind === 'override').length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 tabIndex={-1}>Reports</h1>
          <p className="muted">North Star: real-conversation minutes per case manager per day, 90 to 165 or more.</p>
        </div>
      </div>
      <h2 className="section-h">This session</h2>
      <div className="stats">
        <Stat label="Talk time" value={`${talkMin} min`} sub={`${reached.length} real conversation${reached.length === 1 ? '' : 's'} (demo playback)`} />
        <Stat label="Connect rate" value={attempts.length ? `${Math.round((reached.length / attempts.length) * 100)}%` : 'None yet'} sub="Target 45% or more" />
        <Stat label="2-day contact" value={`${onTime.length} of ${clocked.length}`} sub="Target 90% or more" />
        <Stat label="AI edit rate" value={rates.length ? `${Math.round(avg(rates))}%` : 'None yet'} sub="Target under 30%" />
        <Stat label="Trust score" value={trusts.length ? `${avg(trusts).toFixed(1)} of 5` : 'None yet'} sub="Target 4 or more" />
        <Stat label="Overrides" value={String(overrides)} sub="Reasons feed weight tuning" />
      </div>
      <TimeBudgetChart />
      <section className="card" aria-labelledby="metrics-h">
        <h2 id="metrics-h">Pilot metrics</h2>
        <p className="muted small">Every target is a hypothesis with a baseline taken in pilot week 0.</p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Pilot metrics, baseline and target</caption>
            <thead><tr><th scope="col">Metric</th><th scope="col">Baseline</th><th scope="col">Target</th><th scope="col">Basis</th></tr></thead>
            <tbody>
              {METRICS.map((m) => (
                <tr key={m.metric}><th scope="row">{m.metric}</th><td>{m.baseline}</td><td>{m.target}</td><td>{m.basis}</td></tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}

/* ---------- Audit ---------- */

const KIND_LABELS: Record<AuditKind, string> = {
  view: 'PHI view', override: 'Override', resolve: 'Resolution', merge: 'Merge review', call: 'Call',
  draft: 'AI draft', sign: 'Signature', config: 'Configuration', alert: 'Alert',
};

const csvCell = (v: string) => `"${v.replace(/"/g, '""')}"`;

const downloadCsv = (rows: AuditEntry[]) => {
  const head = ['Time', 'User', 'Type', 'Action', 'Member', 'Reason'].join(',');
  const body = rows.map((a) =>
    [fmtTime(a.at), a.user, KIND_LABELS[a.kind], a.action, a.member, a.reason].map(csvCell).join(','));
  const url = URL.createObjectURL(new Blob([[head, ...body].join('\n')], { type: 'text/csv' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = 'hicase-audit-log.csv';
  link.click();
  URL.revokeObjectURL(url);
};

export function Audit() {
  const { state } = useStore();
  const [kind, setKind] = useState<AuditKind | 'all'>('all');
  const rows = state.audit.filter((a) => kind === 'all' || a.kind === kind);
  const n = (k: AuditKind) => state.audit.filter((a) => a.kind === k).length;
  const present = (Object.keys(KIND_LABELS) as AuditKind[]).filter((k) => n(k) > 0);
  const reasons = state.audit.filter((a) => a.kind === 'override' && a.reason);

  return (
    <>
      <div className="page-head">
        <div>
          <h1 tabIndex={-1}>Audit trail and feedback</h1>
          <p className="muted">Append-only. Views, overrides, resolutions, calls and signatures, each with user, time and reason.</p>
        </div>
        <button type="button" className="btn btn-ghost" disabled={!rows.length} onClick={() => downloadCsv(rows)}>
          <Icon name="download" /> Export CSV
        </button>
      </div>
      <div className="stats">
        <Stat label="PHI views" value={String(n('view'))} sub="Every open of a member" />
        <Stat label="Overrides" value={String(n('override'))} sub={reasons[0] ? `Latest: ${reasons[0].reason}` : 'None yet'} />
        <Stat label="Resolutions" value={String(n('resolve'))} sub="Conflicts settled with a reason" />
        <Stat label="Signatures" value={String(n('sign'))} sub="Entries written at sign-off" />
      </div>
      <section className="panel panel-flush" aria-label="Audit log">
        <div className="panel-bar">
          <h2>Log</h2>
          <label className="sort">
            <span>Type</span>
            <select value={kind} onChange={(e) => setKind(e.target.value as AuditKind | 'all')}>
              <option value="all">All ({state.audit.length})</option>
              {present.map((k) => <option key={k} value={k}>{KIND_LABELS[k]} ({n(k)})</option>)}
            </select>
          </label>
        </div>
        {rows.length ? (
          <div className="table-wrap">
            <table className="table table-roomy" data-testid="audit-table">
              <caption className="sr-only">Audit log, newest first</caption>
              <thead><tr><th scope="col">Time</th><th scope="col">User</th><th scope="col">Type</th><th scope="col">Action</th><th scope="col">Member</th><th scope="col">Reason</th></tr></thead>
              <tbody>
                {rows.map((a) => (
                  <tr key={a.id}>
                    <td className="tnum nowrap">{fmtTime(a.at)}</td><td className="nowrap">{a.user}</td><td>{KIND_LABELS[a.kind]}</td>
                    <th scope="row">{a.action}</th><td>{a.member}</td><td>{a.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : <p className="empty">Nothing logged yet. Open a member, snooze a case or resolve a conflict and it appears here.</p>}
      </section>
    </>
  );
}

/* ---------- Settings ---------- */

const AI_FEATURES: { key: AiFeature; label: string; hint: string }[] = [
  { key: 'brief', label: 'AI brief', hint: 'Member 360 summary' },
  { key: 'prefill', label: 'Assessment prefill', hint: 'Fills fields from sources' },
  { key: 'note', label: 'Call note drafting', hint: 'SOAP sentences with citations' },
  { key: 'plan', label: 'Care-plan drafting', hint: 'Goals, barriers, interventions' },
];

const TIER_TONE = { MUST: 'blue', 'MUST-lite': 'pale', LATER: 'grey' } as const;

export function Settings() {
  const { state, dispatch } = useStore();
  const total = SIGNAL_ORDER.reduce((n, k) => n + state.weights[k], 0);
  const changed = SIGNAL_ORDER.some((k) => state.weights[k] !== DEFAULT_WEIGHTS[k]);
  return (
    <>
      <div className="page-head">
        <div>
          <h1 tabIndex={-1}>Settings</h1>
          <p className="muted">Pilot configuration. Every change here is audit-logged.</p>
        </div>
      </div>
      <div className="grid2">
        <section className="card" aria-labelledby="weights-h">
          <div className="card-head">
            <h2 id="weights-h">Queue score weights</h2>
            <Chip tone={total === 100 ? 'green' : 'amber'}>Total {total}</Chip>
            <button type="button" className="btn btn-ghost btn-sm push" disabled={!changed} onClick={() => dispatch({ type: 'weightsReset' })}>Reset</button>
          </div>
          <p className="muted small">Starting values, tuned weekly in pilot. The queue re-ranks as you move a slider.</p>
          {SIGNAL_ORDER.map((k) => (
            <div className="slider" key={k}>
              <label htmlFor={`w-${k}`}>{SIGNAL_LABELS[k]}</label>
              <input id={`w-${k}`} type="range" min={0} max={60} value={state.weights[k]}
                onChange={(e) => dispatch({ type: 'weight', key: k, value: Number(e.target.value) })}
                onPointerUp={() => dispatch({ type: 'weightsLogged' })}
                onKeyUp={() => dispatch({ type: 'weightsLogged' })} />
              <output className="tnum" htmlFor={`w-${k}`}>{state.weights[k]}</output>
            </div>
          ))}
        </section>
        <section className="card" aria-labelledby="ai-h">
          <h2 id="ai-h">AI kill switches</h2>
          <p className="muted small">Turn any AI feature off. The screen falls back to manual work; rules keep running.</p>
          {AI_FEATURES.map((f) => (
            <label className="switch" key={f.key}>
              <span>{f.label}<span className="cell-sub">{f.hint}</span></span>
              <input type="checkbox" role="switch" checked={state.aiEnabled[f.key]}
                onChange={(e) => dispatch({ type: 'ai', feature: f.key, label: f.label, enabled: e.target.checked })} />
            </label>
          ))}
          <h3 className="mini-h">Reliability</h3>
          <label className="switch">
            <span>Degraded mode<span className="cell-sub">Simulates a feed outage: last-known data with an “as of” stamp</span></span>
            <input type="checkbox" role="switch" checked={state.degraded}
              onChange={(e) => dispatch({ type: 'degraded', value: e.target.checked })} />
          </label>
        </section>
      </div>
      <section className="card" aria-labelledby="auto-h">
        <h2 id="auto-h">What is automated, and what the clinician confirms</h2>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Automation boundary</caption>
            <thead><tr><th scope="col">The system does</th><th scope="col">The clinician confirms</th></tr></thead>
            <tbody>{AUTOMATION.map(([a, b]) => <tr key={a}><td>{a}</td><td>{b}</td></tr>)}</tbody>
          </table>
        </div>
        <p className="muted small">Never in the MVP: auto-contacting members, AI-made clinical decisions, auto-merging records, suggesting diagnoses.</p>
      </section>
      <section className="card" aria-labelledby="data-h">
        <h2 id="data-h">Datasets</h2>
        <p className="muted small">9 MUST and 4 MUST-lite ship in the MVP; 5 of the 18 candidates are LATER.</p>
        <div className="table-wrap">
          <table className="table">
            <caption className="sr-only">Dataset inventory</caption>
            <thead><tr><th scope="col" className="num">#</th><th scope="col">Dataset</th><th scope="col">Source</th><th scope="col">Freshness</th><th scope="col">MVP</th></tr></thead>
            <tbody>
              {DATASETS.map((d) => (
                <tr key={d.n}>
                  <td className="num">{d.n}</td><th scope="row">{d.name}</th><td>{d.source}</td><td>{d.freshness}</td>
                  <td><Chip tone={TIER_TONE[d.tier]}>{d.tier}</Chip></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
