/** Screen 1: the ranked queue that replaces Maria's 8 am spreadsheet. */
import { useState } from 'react';
import { ARRIVAL_COUNT } from '../data/arrivals';
import {
  capacity, clockView, contactMade, FILTER_LABELS, matchesFilter, needsReview, ROUTINE, score, sortQueue,
  tcmClock, WORKDAY_HOURS, type QueueFilter, type QueueSort,
} from '../domain/rules';
import { sameDay, fmtTime } from '../domain/dates';
import type { Patient } from '../domain/types';
import { allPatients } from '../state/reducer';
import { navigate, paths } from '../state/route';
import { useStore } from '../state/store';
import { DuplicateDialog, OverrideDialog, ScoreDialog } from '../ui/dialogs';
import { Chip, ConfidenceChip, FreshChip, Icon } from '../ui/parts';

type RowDialog = { type: 'score' | 'override' | 'duplicate'; p: Patient } | null;
const FILTERS: QueueFilter[] = ['all', 'discharges', 'due', 'unreachable', 'review'];

function ScoreRing({ value, onClick, name }: { value: number; onClick: () => void; name: string }) {
  return (
    <button type="button" className="ring" onClick={onClick} style={{ '--p': value } as React.CSSProperties}
      aria-label={`Score ${value} of 100 for ${name}. Show breakdown`}>
      <span>{value}</span>
    </button>
  );
}

function Row({ p, rank, openDialog }: { p: Patient; rank: number; openDialog: (d: RowDialog) => void }) {
  const { state, now, dispatch } = useStore();
  const c = state.cases[p.id];
  const s = score(p.signals, state.weights);
  const clock = clockView(p, c, now);
  const lowPhone = p.phones.find((n) => n.role === 'member' && n.doNotDial);
  const done = !!c.signed;
  const snoozed = c.override?.kind === 'snooze';
  const dupOpen = !!p.duplicate && !c.duplicateDecision;

  const act = () => (dupOpen ? openDialog({ type: 'duplicate', p }) : navigate(paths.outreach(p.id)));

  return (
    <tr className={`qrow${done || snoozed ? ' is-dim' : ''}${clock.tone === 'red' ? ' is-urgent' : ''}`} data-member={p.id} data-rank={rank}>
      <td data-label="Score"><ScoreRing value={s} name={p.name} onClick={() => openDialog({ type: 'score', p })} /></td>
      <td data-label="Member">
        <a className="member-link" href={paths.member(p.id)}>{p.name}, {p.age}</a>
        <span className="cell-sub">{p.tags}</span>
      </td>
      <td data-label="Why now">
        <p className="why">{p.whyNow}</p>
        {p.newSinceTouch && !c.touched && (
          <p className="new-line"><span className="dot" aria-hidden="true" /> New since your last touch: {p.newSinceTouch}</p>
        )}
        {c.override && (
          <p className="override-line">
            <Chip tone="grey">{c.override.kind === 'snooze' ? 'Snoozed' : c.override.kind === 'top' ? 'Moved to top' : 'Moved down'}</Chip>
            <span className="cell-sub">{c.override.reason}</span>
          </p>
        )}
      </td>
      <td data-label="Clock">
        <span className={`clock clock-${clock.tone}`} data-testid={`clock-${p.id}`}>
          {clock.tone === 'red' && <Icon name="clock" size={14} />} {clock.label}
          {clock.tone === 'red' && clock.hoursLeft !== null && clock.hoursLeft > 0 && <span className="sr-only"> (under 4 hours)</span>}
        </span>
        {clock.sub && <span className="cell-sub">{clock.sub}</span>}
      </td>
      <td data-label="Next best action">
        <div className="row-actions">
          {done ? (
            <Chip tone="green"><Icon name="check" size={12} /> Signed {fmtTime(c.signed!.at)}</Chip>
          ) : snoozed ? null : (
            <button type="button" className="btn btn-primary btn-block" onClick={act}>{p.nextAction}</button>
          )}
          {c.override ? (
            <button type="button" className="btn-link" onClick={() => dispatch({ type: 'clearOverride', id: p.id })}>Undo override</button>
          ) : !done && (
            <button type="button" className="btn-link" onClick={() => openDialog({ type: 'override', p })}>Snooze or override</button>
          )}
        </div>
      </td>
      <td data-label="Data">
        <div className="chips-col">
          {p.rowFeeds.map((f) => <FreshChip key={f} p={p} feed={f} />)}
          {dupOpen && <Chip tone="red">Dup ID</Chip>}
          {lowPhone && <ConfidenceChip value={lowPhone.confidence} prefix="Phone" />}
        </div>
      </td>
    </tr>
  );
}

export function Queue() {
  const { state, now, dispatch, toast } = useStore();
  const [filter, setFilter] = useState<QueueFilter>('all');
  const [sort, setSort] = useState<QueueSort>('score');
  const [dialog, setDialog] = useState<RowDialog>(null);

  const patients = allPatients(state);
  const cap = capacity(patients, state.cases);
  const count = (f: QueueFilter) => patients.filter((p) => matchesFilter(f, p, state.cases[p.id], now)).length;
  const rows = sortQueue(
    patients.filter((p) => matchesFilter(filter, p, state.cases[p.id], now)),
    state.cases, state.weights, sort,
  );
  const clocksToday = patients.filter((p) => {
    const c = state.cases[p.id];
    return p.discharge && !contactMade(c) && !c.signed && sameDay(tcmClock(p.discharge).contactDue, now);
  }).length;
  const urgent = patients.filter((p) => clockView(p, state.cases[p.id], now).tone === 'red').length;
  const reviews = patients.filter((p) => needsReview(p, state.cases[p.id])).length;

  return (
    <>
      <div className="page-head">
        <div>
          <h1 tabIndex={-1}>Today’s work queue</h1>
          <p className="muted">Ranked by a transparent score. Discharge alerts drive the top; claims only confirm.</p>
        </div>
      </div>

      <section className="panel capacity" aria-label="Capacity today">
        <div className="capacity-main">
          <h2 data-testid="capacity-title">Today: {cap.tasks} tasks · about {cap.hours.toFixed(1)} h of {WORKDAY_HOURS} h</h2>
          <div className="meter" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.min(cap.pct, 100)}
            aria-label={`${cap.pct}% of capacity`}>
            <div className={`meter-fill${cap.over ? ' is-over' : ''}`} style={{ width: `${Math.min(cap.pct, 100)}%` }} />
          </div>
          <p className="small" data-testid="capacity-note">
            {cap.pct}% of capacity
            {cap.over && <strong className="text-red"> · Over capacity: snooze or hand off a case</strong>}
          </p>
        </div>
        <div className="capacity-side">
          <Chip tone="blue">{state.arrivals.length} new discharge{state.arrivals.length === 1 ? '' : 's'} since 8 am</Chip>
          <Chip tone={urgent ? 'red' : 'amber'}>{urgent ? `${urgent} under 4 h` : `${clocksToday} clock${clocksToday === 1 ? ' ends' : 's end'} today`}</Chip>
          <Chip tone="grey">{reviews} need review</Chip>
          <button type="button" className="btn btn-ghost" disabled={state.arrivals.length >= ARRIVAL_COUNT}
            onClick={() => { dispatch({ type: 'arrival' }); toast('New discharge alert added to the queue'); }}>
            Simulate new discharge alert
          </button>
        </div>
      </section>

      <div className="toolbar">
        <div className="seg" role="group" aria-label="Filter the queue">
          {FILTERS.map((f) => (
            <button key={f} type="button" className="seg-btn" aria-pressed={filter === f} onClick={() => setFilter(f)}>
              {FILTER_LABELS[f]} ({count(f)})
            </button>
          ))}
        </div>
        <label className="sort">
          <span>Sort</span>
          <select value={sort} onChange={(e) => setSort(e.target.value as QueueSort)}>
            <option value="score">Score</option>
            <option value="clock">Clock</option>
          </select>
        </label>
      </div>

      <div className="panel panel-flush">
        <table className="queue">
          <caption className="sr-only">Active cases ranked by score</caption>
          <thead>
            <tr>
              <th scope="col">Score</th><th scope="col">Member</th><th scope="col">Why this member, why now</th>
              <th scope="col">Clock</th><th scope="col">Next best action</th><th scope="col">Data</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((p, i) => <Row key={p.id} p={p} rank={i + 1} openDialog={setDialog} />)}
            {rows.length === 0 && <tr><td colSpan={6} className="empty">No cases match this filter.</td></tr>}
          </tbody>
        </table>
      </div>
      <p className="muted small after-table">
        {ROUTINE.tasks} routine follow-up tasks (about {ROUTINE.hours.toFixed(1)} h) on Maria’s other cases count toward capacity but are not modelled in this prototype.
      </p>

      {dialog?.type === 'score' && <ScoreDialog p={dialog.p} onClose={() => setDialog(null)} />}
      {dialog?.type === 'override' && <OverrideDialog p={dialog.p} onClose={() => setDialog(null)} />}
      {dialog?.type === 'duplicate' && (
        <DuplicateDialog p={dialog.p} onClose={() => setDialog(null)} onDone={() => navigate(paths.outreach(dialog.p.id))} />
      )}
    </>
  );
}
