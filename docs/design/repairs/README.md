# Repairs: design

Visual design for the **Repairs** page (`/repairs`), the page that replaces the "Maintenance Log" tab of Sam's spreadsheet. Drawn on 2026-11-18 from the answers the user gave in the chat (there is no author's sketch for this one), the spreadsheet's maintenance log, and the existing page. The spec that approves it is [repairs-01-design.md](../../specs/repairs-01-design.md).

Published canvas (private, owner-only until shared): https://claude.ai/artifact/HUjgVSe5R7kMSmZ3ZyJWP4

## Files

These are the canvas source files, copied from the published version. They open only in the Design editor and are not part of the app build. Prettier skips them (see `.prettierignore`); do not reformat them by hand.

- `canvas.json`: the index (artboard positions, order, titles).
- `Main.dc.html`: the page, **Open** tab. Header with **New repair**, the totals strip (CAD and USD), the tabs, the toolbar (Search, Bleacher, Zone, Vendor, Category, Show Deleted), the 17-column table, one repair expanded (JJ-5, three services), the pager. Interactive: tabs, expanding a row, the status menu, the filter lists, the filter ticks. The other boards import this one and only change its starting state.
- `Completed.dc.html`: `Main` on the **Completed** tab.
- `StatusMenu.dc.html`: `Main` with the status menu open on a row.
- `FilterMenu.dc.html`: `Main` with the Category list open and two categories ticked.
- `Empty.dc.html`: `Main` with no rows ("No repairs found.").
- `ServiceModal.dc.html`: the service window, view mode. `mode` is `view`, `edit` or `new`.
- `ServiceModalEdit.dc.html`, `ServiceModalNew.dc.html`: the same window in edit mode and in add mode.
- `InvoiceModal.dc.html`: the repair window, view mode. `mode` is `view`, `edit` or `new`.
- `InvoiceModalEdit.dc.html`, `InvoiceModalNew.dc.html`: the same window in edit mode and as New repair.

All boards are static or clickable in Play. The links between them follow the flow: a service row opens the service window, the button at the end of a row opens the repair window, Edit opens the edit board, Close and Cancel go back.

## Notes

- Names, vendors, invoice numbers and amounts follow the spreadsheet's maintenance log, with a few rows invented for the Inbound and Confirm repair statuses (the spreadsheet's log has none of them). The sums in the strip and in the repair window are computed from the rows drawn.
- The page is drawn at 1440 px without the app's sidebar. The table is 2554 px wide and scrolls inside its box; the first column (arrow and bleacher chips) and the last (the open button) stay in view.
- The six statuses are drawn as pills with a label, so colour is never the only signal: Inbound blue, Triaged purple, Waiting repair amber, In repair orange, Confirm repair teal, Completed green.
- Money is written with the currency of the repair: `$` for USD, `C$` for CAD. A missing amount is a dash, a zero is `$0.00`.
- The windows are drawn on a dimmed background without the page behind them. The dropdown lists of the windows (Bleacher, Category, Severity, Vendor, Status, Currency) are drawn closed. The inputs are not editable in Play.
- The font is Geist, as in the other designs. The fills and inks of the pills are the app's own tones; the rest are the app's Tailwind greys and the brand blues.

## Not drawn

- The **Show Deleted** view (the button is in the toolbar, as today; how deleted repairs are listed is not decided yet).
- Loading and error states.
- The delete confirmations (the existing "Are you absolutely sure?" dialog is reused).
- Views for roles that cannot edit (no New repair, no Edit, no Delete, no status menu).
- Narrow screens.
