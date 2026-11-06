/** Shared building blocks: icons, chips, citations, modal and form errors. */
import { useEffect, useId, useRef, type ReactNode } from 'react';
import { FEED_NAMES, FEED_SHORT } from '../data/reference';
import { feedAge, fmtAge, freshness } from '../domain/rules';
import type { Cite, Confidence, FeedKey, Patient } from '../domain/types';
import { useStore } from '../state/store';

const ICONS = {
  phone: 'M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A15 15 0 0 1 3 6a2 2 0 0 1 2-2',
  alert: 'M12 9v4m0 4h.01M10.3 3.9 2.4 17.5A2 2 0 0 0 4.1 20.5h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0',
  check: 'm5 12 5 5L20 7',
  close: 'M18 6 6 18M6 6l12 12',
  back: 'M19 12H5m7 7-7-7 7-7',
  doc: 'M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9zM14 3v6h6M8 13h8M8 17h6',
  clock: 'M12 7v5l3 2m6-2a9 9 0 1 1-18 0 9 9 0 0 1 18 0',
  search: 'm21 21-4.3-4.3M19 11a8 8 0 1 1-16 0 8 8 0 0 1 16 0',
  download: 'M12 3v12m0 0 4-4m-4 4-4-4M4 21h16',
  layers: 'm12 3 9 5-9 5-9-5zM3 13l9 5 9-5',
} as const;

export function Icon({ name, size = 16 }: { name: keyof typeof ICONS; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"
      strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
      <path d={ICONS[name]} />
    </svg>
  );
}

export type ChipTone = 'green' | 'amber' | 'red' | 'blue' | 'pale' | 'grey';

export function Chip({ tone, children, title }: { tone: ChipTone; children: ReactNode; title?: string }) {
  return <span className={`chip chip-${tone}`} title={title}>{children}</span>;
}

const FRESH_WORD = { green: 'fresh', amber: 'aging', red: 'stale' } as const;

/** Freshness chip: the source and age are text, so color never carries the meaning alone. */
export function FreshChip({ p, feed, prefix, qualifier }: { p: Patient; feed: FeedKey; prefix?: string; qualifier?: string }) {
  const { now } = useStore();
  const age = feedAge(p, feed, now);
  // A recent check of an unknown source is not fresh data: never show it green.
  const fresh = freshness(age);
  const tone = qualifier && fresh === 'green' ? 'amber' : fresh;
  const label = `${prefix ?? FEED_SHORT[feed]} ${fmtAge(age)}${qualifier ? ` · ${qualifier}` : ''}`;
  const asOf = p.feeds[feed];
  const title = `${FEED_NAMES[feed]}: ${age === null ? 'not received, shown as unknown' : `as of ${asOf}, ${FRESH_WORD[tone]}`}`;
  return <Chip tone={tone} title={title}>{label}</Chip>;
}

const CONF_TONE: Record<Confidence, ChipTone> = { High: 'green', Medium: 'amber', Low: 'red', None: 'red' };

export function ConfidenceChip({ value, prefix = 'Confidence' }: { value: Confidence; prefix?: string }) {
  return <Chip tone={CONF_TONE[value]}>{prefix}: {value}</Chip>;
}

/** Citation list. A source citation opens that record; a transcript one jumps to the line. */
export function Cites({ p, cites, onTranscript, dictated }: {
  p: Patient;
  cites: Cite[];
  onTranscript?: (t: number) => void;
  dictated?: boolean;
}) {
  const { openSources } = useStore();
  return (
    <span className="cites">
      {cites.map((c) => {
        if (c.t !== undefined) {
          if (dictated) return <span className="cite cite-static" key={c.label}>[dictation]</span>;
          return (
            <button type="button" className="cite" key={c.label} disabled={!onTranscript}
              onClick={() => onTranscript?.(c.t!)} aria-label={`Go to ${c.label}`}>
              [{c.label}]
            </button>
          );
        }
        return (
          <button type="button" className="cite" key={c.label} onClick={() => openSources(p.id, c.feed)}
            aria-label={`Open source record: ${c.label}`}>
            [{c.label}]
          </button>
        );
      })}
    </span>
  );
}

export function Modal({ title, subtitle, onClose, children, footer, side, wide, required }: {
  title: string;
  subtitle?: ReactNode;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  side?: boolean;
  wide?: boolean;
  /** The step must be completed, so there is no close button. */
  required?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const d = ref.current;
    // React detaches the dialog before this cleanup, so the browser cannot return focus itself.
    const opener = document.activeElement as HTMLElement | null;
    if (d && !d.open) d.showModal();
    return () => {
      d?.close();
      if (opener?.isConnected) opener.focus();
    };
  }, []);

  return (
    <dialog ref={ref} className={`modal${side ? ' modal-side' : ''}${wide ? ' modal-wide' : ''}`} aria-labelledby={titleId}
      onCancel={(e) => { e.preventDefault(); onClose(); }}
      onClick={(e) => { if (e.target === ref.current) onClose(); }}>
      <div className="modal-box">
        <header className="modal-head">
          <div>
            <h2 id={titleId}>{title}</h2>
            {subtitle && <p className="muted">{subtitle}</p>}
          </div>
          {!required && (
            <button type="button" className="btn-icon" onClick={onClose} aria-label="Close">
              <Icon name="close" />
            </button>
          )}
        </header>
        <div className="modal-body">{children}</div>
        {footer && <footer className="modal-foot">{footer}</footer>}
      </div>
    </dialog>
  );
}

export function FormError({ id, children }: { id: string; children: ReactNode }) {
  if (!children) return null;
  return <p className="form-error" id={id} role="alert"><Icon name="alert" size={14} /> {children}</p>;
}

export function DraftTag({ confirmed, label }: { confirmed: boolean; label?: string }) {
  return confirmed
    ? <Chip tone="green"><Icon name="check" size={12} /> {label ?? 'Confirmed'}</Chip>
    : <Chip tone="amber">DRAFT</Chip>;
}
