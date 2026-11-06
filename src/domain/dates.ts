/** Date math for clocks and freshness. Dates are local; ISO strings are YYYY-MM-DD. */

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const DAY_MS = 86_400_000;

/** Demo "as of" moment, matching the annex: Monday 9 Nov 2026, 8:00 am. */
export const AS_OF = new Date(2026, 10, 9, 8, 0, 0);

/** US federal holidays the 2-business-day clock must skip. */
export const HOLIDAYS = new Set(['2026-11-11', '2026-11-26', '2026-12-25', '2027-01-01']);

export const parseDate = (iso: string): Date => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export const toIso = (d: Date): string =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

const startOfDay = (d: Date): Date => new Date(d.getFullYear(), d.getMonth(), d.getDate());

export const sameDay = (a: Date, b: Date): boolean => toIso(a) === toIso(b);

/** Whole calendar days from iso to now. Safe across daylight-saving changes. */
export const ageDays = (iso: string, now: Date): number =>
  Math.round((startOfDay(now).getTime() - parseDate(iso).getTime()) / DAY_MS);

export const addDays = (d: Date, n: number): Date =>
  new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);

export const isBusinessDay = (d: Date): boolean => {
  const day = d.getDay();
  return day !== 0 && day !== 6 && !HOLIDAYS.has(toIso(d));
};

export const addBusinessDays = (start: Date, n: number): Date => {
  let d = startOfDay(start);
  let left = n;
  while (left > 0) {
    d = addDays(d, 1);
    if (isBusinessDay(d)) left -= 1;
  }
  return d;
};

export const fmtDate = (d: Date | string): string => {
  const x = typeof d === 'string' ? parseDate(d) : d;
  return `${x.getDate()} ${MONTHS[x.getMonth()]}`;
};

export const fmtDay = (d: Date | string): string => {
  const x = typeof d === 'string' ? parseDate(d) : d;
  return `${DAYS[x.getDay()]} ${fmtDate(x)}`;
};

/** "5 pm" on the hour, "5:30 pm" otherwise. */
export const fmtTime = (d: Date | number): string => {
  const x = typeof d === 'number' ? new Date(d) : d;
  const m = x.getMinutes();
  const h = x.getHours() % 12 || 12;
  const ap = x.getHours() >= 12 ? 'pm' : 'am';
  return m === 0 ? `${h} ${ap}` : `${h}:${String(m).padStart(2, '0')} ${ap}`;
};

export const fmtClock = (secs: number): string =>
  `${String(Math.floor(secs / 60)).padStart(2, '0')}:${String(Math.floor(secs % 60)).padStart(2, '0')}`;
