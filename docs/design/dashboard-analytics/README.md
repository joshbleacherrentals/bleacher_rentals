# Dashboard & Analytics: design

Visual design for the **Dashboard & Analytics** page (`/dashboard-analytics`), the page that copies the "Dashboard & Analytics" tab of Sam's spreadsheet. Drawn on 2026-11-25 from the answers the user gave in the chat, the spreadsheet's dashboard tab and the existing Repairs page. The spec that approves it is [dashboard-analytics-01-design.md](../../specs/dashboard-analytics-01-design.md).

Published canvas (private, owner-only until shared): https://claude.ai/artifact/KV8ojwavxA5HB1ibuzgMpg

## Files

These are the canvas source files, copied from the published version. They open only in the Design editor and are not part of the app build. Prettier skips them (see `.prettierignore`); do not reformat them by hand.

- `canvas.json`: the index (artboard positions, order, titles).
- `Main.dc.html`: the page for 2026. Header with the period dropdown, the CAD note, the five cards, and five full-width blocks one under another: zones, top models, categories, the category chart, vendors. Interactive: the dropdown switches 2026, 2025 and All time and every figure follows. The other boards import this one and only change its starting state (`period`, `budget`, `models`, `notice`, `yearMenu`, `empty`, `loading`).
- `AllTime.dc.html`: `Main` on All time.
- `YearMenu.dc.html`: `Main` with the period dropdown open.
- `OverBudget.dc.html`: `Main` with the spend over the budget (red).
- `NoBudget.dc.html`: `Main` with no budget row ("Budget not set").
- `NoModels.dc.html`: `Main` with no model numbers on the bleachers ("No model numbers yet").
- `NoRate.dc.html`: `Main` with the missing-rate line instead of the CAD note.
- `EmptyYear.dc.html`: `Main` for a year with no repairs.
- `Loading.dc.html`: `Main` while the repairs and the exchange rates are being read.

## Notes

- All figures are samples. The 144 bleachers and the eight zones are the local database's; the categories, vendors and model numbers follow the spreadsheet. `Main` computes every sum and percent from its sample rows, so the cards, the tables and the chart agree with each other, and All time and 2025 are the 2026 rows times 5 and 3.
- The page is drawn at 1440 px without the app's sidebar. A table is at least 760 px wide and scrolls inside its box on a narrow screen.
- Money is all USD with a `$` sign: cents in the cards and tables, whole dollars in captions and chart labels. There is no `C$` on this page.
- The font is Geist, as in the other designs. The colours are the app's: the brand navy `#10365a`, the Tailwind greys, red for an over-spent budget and amber for the missing-rate line.

## Not drawn

- Narrow screens.
- The keyboard behaviour and the focus ring of the period dropdown.
- Views for other roles: the three roles that open the page see the same read-only page.
