# Accountant Collections: design

Visual design for the **Collections** tab on `/accountant` and the `/accountant/invoice` page. Drawn on 2026-10-27 from the author's Excalidraw sketch and revised on 2026-11-02: the Tasks tab was removed (its table moved into Information as Task History), and Messages, Files, Open PDF, View customer page and the floating New Task window were added.

Published canvas (private, owner-only until shared): https://claude.ai/artifact/L86cRNaAorJoeACkkeWox7

## Files

These are the canvas source files, copied from the published version. They open only in the Design editor and are not part of the app build. Prettier skips them (see `.prettierignore`); do not reformat them by hand.

- `canvas.json`: the index (artboard positions, order, titles).
- `Main.dc.html`: Collections tab. Interactive: Show Not Due Yet, sorting by Next Follow Up, Payment Overdue and Amount Overdue.
- `CollectionsNotDue.dc.html`: `Main` with Show Not Due Yet on.
- `Invoice.dc.html`: invoice page. Header (Open PDF, View customer page toggle, Record Payment, Status), the Information and Messages tabs, the New Task button with its floating window, and the customer view (Approved Quote, Signed Contract, Pay Invoice).
- `InvoiceMessages.dc.html`: `Invoice` opened on Messages.
- `InvoiceNewTask.dc.html`, `InvoiceNewTaskPicker.dc.html`: `Invoice` with the New Task window open, and with its date picker open.
- `InvoiceCustomerQuote.dc.html`, `InvoiceCustomerContract.dc.html`, `InvoiceCustomerPay.dc.html`: `Invoice` with View customer page on, one file per customer tab.
- `Contacts.dc.html`: the three contact card layouts (both contacts, no finance contact, no company info).

## Notes

- Names, amounts and dates are made up. The Riverside Charity Run row and the invoice page agree (3 days overdue, C$1,735.75, "today" is Nov 10, 2026).
- The Status selector (Paid / Collections / Cancelled) from the sketch was removed on request, so the tab shows only the Collections list. Search and filters are not drawn either, because the sketch does not define them.
- Copy kept as written in the sketch, for example "3 months after".
