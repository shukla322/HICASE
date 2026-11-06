import { useEffect, useRef, useState } from 'react';
import { fmtClock, fmtDay, fmtTime } from './domain/dates';
import { allPatients, findPatient } from './state/reducer';
import { paths, useRoute, type Route } from './state/route';
import { useStore } from './state/store';
import { Member360 } from './screens/Member360';
import { Outreach } from './screens/Outreach';
import { Audit, Members, Reports, Settings } from './screens/Pages';
import { Queue } from './screens/Queue';
import { SourceDrawer } from './ui/dialogs';
import { Icon, Modal } from './ui/parts';

const NAV = [
  { href: '#/queue', label: 'Queue', match: ['queue'] },
  { href: '#/members', label: 'Members', match: ['members', 'member', 'outreach'] },
  { href: '#/reports', label: 'Reports', match: ['reports'] },
  { href: '#/audit', label: 'Audit', match: ['audit'] },
  { href: '#/settings', label: 'Settings', match: ['settings'] },
];

function titleFor(route: Route, name?: string): string {
  switch (route.name) {
    case 'queue': return 'Work queue';
    case 'members': return 'Members';
    case 'member': return name ? `${name}: Member 360` : 'Member not found';
    case 'outreach': return name ? `${name}: Outreach` : 'Member not found';
    case 'reports': return 'Reports';
    case 'audit': return 'Audit trail';
    case 'settings': return 'Settings';
    default: return 'Page not found';
  }
}

function NotFound({ what }: { what: string }) {
  return (
    <div className="page-head">
      <div>
        <h1 tabIndex={-1}>{what} not found</h1>
        <p className="muted">It may have been cleared by a demo reset. <a href={paths.queue}>Back to the queue</a></p>
      </div>
    </div>
  );
}

function DemoBar() {
  const { now, dispatch, toast } = useStore();
  const [confirm, setConfirm] = useState(false);
  return (
    <div className="demobar">
      <p><strong>Prototype.</strong> Synthetic data only, no PHI.</p>
      <div className="demobar-actions">
        <span className="tnum" data-testid="demo-clock">Demo clock: {fmtDay(now)}, {fmtTime(now)}</span>
        <button type="button" className="btn-mini" onClick={() => dispatch({ type: 'advance', minutes: 60 })}>+1 h</button>
        <button type="button" className="btn-mini" onClick={() => setConfirm(true)}>Reset demo</button>
      </div>
      {confirm && (
        <Modal title="Reset the demo?" subtitle="This clears the audit log, drafts, decisions and signatures, and returns the clock to Mon 9 Nov, 8 am."
          onClose={() => setConfirm(false)}
          footer={(
            <>
              <button type="button" className="btn btn-ghost" onClick={() => setConfirm(false)}>Cancel</button>
              <button type="button" className="btn btn-danger" onClick={() => {
                dispatch({ type: 'reset' });
                setConfirm(false);
                window.location.hash = paths.queue;
                toast('Demo reset to Mon 9 Nov, 8 am');
              }}>Reset demo</button>
            </>
          )}>
          <p className="muted small">Reset exists only for the demo. The production audit log is immutable.</p>
        </Modal>
      )}
    </div>
  );
}

function Header({ route }: { route: Route }) {
  const { state } = useStore();
  const live = allPatients(state).find((p) => state.cases[p.id].call);
  return (
    <header className="topbar">
      <a className="logo" href={paths.queue} aria-label="HiCase home"><b>Hi</b>Case</a>
      <nav aria-label="Primary">
        <ul className="nav">
          {NAV.map((n) => (
            <li key={n.href}>
              <a href={n.href} aria-current={n.match.includes(route.name) ? 'page' : undefined}>{n.label}</a>
            </li>
          ))}
        </ul>
      </nav>
      <div className="topbar-right">
        {live && (
          <a className="on-call" href={paths.outreach(live.id)}>
            <Icon name="phone" size={14} /> On call: {live.name} <span className="tnum">{fmtClock(state.cases[live.id].call!.secs)}</span>
          </a>
        )}
        <span className="user"><span className="avatar" aria-hidden="true">M</span> Maria T., RN</span>
      </div>
    </header>
  );
}

export function App() {
  const { state, toastMessage } = useStore();
  const { route, key } = useRoute();
  const main = useRef<HTMLElement>(null);
  const lastKey = useRef(key);
  const patient = 'id' in route ? findPatient(state, route.id) : undefined;

  useEffect(() => {
    document.title = `${titleFor(route, patient?.name)} · HiCase`;
    window.scrollTo(0, 0);
    if (lastKey.current === key) return;
    lastKey.current = key;
    // Move keyboard and screen-reader users to the new page's heading.
    main.current?.querySelector<HTMLElement>('h1')?.focus({ preventScroll: true });
  }, [key]); // eslint-disable-line react-hooks/exhaustive-deps

  let screen;
  switch (route.name) {
    case 'queue': screen = <Queue />; break;
    case 'members': screen = <Members />; break;
    case 'reports': screen = <Reports />; break;
    case 'audit': screen = <Audit />; break;
    case 'settings': screen = <Settings />; break;
    case 'member': screen = patient ? <Member360 key={patient.id} p={patient} /> : <NotFound what="Member" />; break;
    case 'outreach': screen = patient ? <Outreach key={patient.id} p={patient} /> : <NotFound what="Member" />; break;
    default: screen = <NotFound what="Page" />;
  }

  return (
    <>
      <a className="skip" href="#main" onClick={(e) => { e.preventDefault(); main.current?.focus(); }}>Skip to main content</a>
      <DemoBar />
      <Header route={route} />
      {state.degraded && (
        <p className="degraded" role="status"><Icon name="alert" /> Degraded mode: feeds are unavailable. Showing last-known data as of Mon 9 Nov, 6 am.</p>
      )}
      <main id="main" ref={main} tabIndex={-1} className="page">{screen}</main>
      <footer className="footer">
        HiCase Workbench MVP · product case prototype, not a production system · all members are fictional
      </footer>
      <SourceDrawer />
      <div className="toast-region" role="status" aria-live="polite">
        {toastMessage && <div className="toast">{toastMessage}</div>}
      </div>
    </>
  );
}
