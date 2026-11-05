# Accountant Audit: design

Visual design for the **Audit** tab on `/accountant`. Drawn on 2026-11-06 from the author's Excalidraw sketch: pick a driver, then see a table of all of that driver's work trackers with their payment status.

Published canvas (private, owner-only until shared): https://claude.ai/artifact/TRVWwib5nNW54c4iwj2B3b

## Files

These are the canvas source files, copied from the published version. They open only in the Design editor and are not part of the app build. Prettier skips them (see `.prettierignore`); do not reformat them by hand.

- `canvas.json`: the index (artboard positions, order, titles).
- `Main.dc.html`: no driver chosen yet. The driver select and an empty state.
- `Search.dc.html`: the driver select open, with "M" typed in the search box and four matching drivers.
- `Table.dc.html`: a driver chosen. The driver's address, phone and email, and the table (Status, Date, Bleacher, Type, Pickup location, Dropoff location, Drive time, Distance, Payment status).

All three artboards are static.

## Notes

- Names, addresses, phone numbers and dates are made up. The six rows follow the sketch: four Paid and two Not paid, in the sketch's order, with the two Repair rows showing no drive time or distance.
- Payment status in the table is Paid or Not paid. Not paid has a ring icon and Paid a check icon, so the two do not rely on colour alone.
- Differences from the sketch: the active tab uses the app's own tab style instead of orange; the driver select is the app's existing select (up/down chevron, search inside the open list, a clear button once a driver is chosen); dates are written `YYYY-MM-DD`, newest first (the sketch had year-day-month); an empty state was added for the no-driver screen.
- Not decided yet, so not drawn: which drivers an accountant can choose from, and which work tracker statuses are listed. Every row in the design shows Completed.
