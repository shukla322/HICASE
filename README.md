# HiCase Workbench MVP

One ranked queue, one Member 360 page and one call-and-document view for RN case managers, built to `HiCase Workbench MVP Product Requirements.md`. It runs entirely in the browser on the five synthetic patients from the annex. No PHI, no backend, no network calls.

## Run it

Open `../HiCase Workbench MVP.html` with a double click, or run the dev server:

```
npm install
npm run dev
```

| Command | What it does |
| --- | --- |
| `npm run dev` | Dev server |
| `npm run build` | Production build in `dist/` |
| `npm run build:single` | One self-contained HTML file in `dist-single/` |
| `npm test` | Unit tests for the rules and data |
| `npm run test:e2e` | PRD acceptance, WCAG, layout and keyboard tests in Chrome |

## Demo script

The clock is fixed at Mon 9 Nov 2026, 8 am, matching the annex. Use **+1 h** in the top bar to move it and **Reset demo** to start over.

1. **Queue:** Harold ranks first at 90. Click the score ring for the breakdown. Press +1 h six times and his clock turns red.
2. **Capacity:** press Simulate new discharge alert twice to go over 100%.
3. **Member 360:** open Harold, then Resolve furosemide. A reason is required.
4. **Outreach:** tick consent, press Call, then Skip to end of demo call, End call and log Reached. Resolve the conflicts, edit a sentence to watch the edit rate, tick the review box and sign.
5. **Audit:** every view, override, resolution, call and signature is listed.
6. **Other patients:** Tamika blocks outreach until the duplicate is reviewed. Dwayne routes to the ED social worker. Untick consent to see the dictation path.

## Structure

| Path | Holds |
| --- | --- |
| `src/domain/` | Pure rules: score, clocks, freshness, supply gap, medication ranking, assessment, edit rate |
| `src/data/` | Synthetic patients, new arrivals, 40-field template, reference tables |
| `src/state/` | Reducer (every action writes its audit entry), store, hash routes |
| `src/screens/` | Queue, Member 360, Outreach, and Members, Reports, Audit, Settings |
| `src/ui/` | Chips, citations, modal, dialogs, source drawer |
| `src/styles/app.css` | Design tokens and all styles |
| `tests/e2e/` | `acceptance.spec.ts` follows PRD section 7 by requirement ID |

## What stands in for production

- AI drafts are templates built from the source records, as the PRD specifies. There is no LLM call.
- The call and transcript are simulated at 20× speed. No telephony is connected.
- State lives in this browser's `localStorage`. The production audit log is server-side and immutable, so Reset exists only in the demo.
- There is no sign-in or role-based access. The user is always Maria T.
