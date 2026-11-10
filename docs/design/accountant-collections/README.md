# Accountant Collections: design

Visual design for the **Collections** tab on `/accountant` and the `/accountant/invoice` page. Drawn on 2026-10-27 from the author's Excalidraw sketch and revised on 2026-11-02: the Tasks tab was removed (its table moved into Information as Task History), and Messages, Files, Open PDF, View customer page and the floating New Task window were added.

Revised again on 2026-11-10 (seven changes, all on the invoice page):

1. Header: an **Open Q/I** button, before Open PDF, that opens `/quotes-bookings/{id}` in a new tab.
2. Task History: a delete button on every closed task, none on the open one. It opens an "Are you sure?" dialog with Yes and No; it also closes on the X, a click outside, and Esc.
3. Task History: a **Finished at** column (the day the task was closed; "—" for the open task), and an Open marker on the open task's note.
4. Task History: the Date column is now **Due Date**.
5. The invoice card: under Invoice, a **Signed** line with when and by whom.
6. Files: the whole row is clickable (open or download); the download and delete buttons stay where they were.
7. Previous Task / Next Task: the footer buttons stay, and when the window has room outside the 1040 px column they also appear in the margins, sticky.

Published canvas (private, owner-only until shared): https://claude.ai/artifact/L86cRNaAorJoeACkkeWox7

## Files

These are the canvas source files, copied from the published version. They open only in the Design editor and are not part of the app build. Prettier skips them (see `.prettierignore`); do not reformat them by hand.

- `canvas.json`: the index (artboard positions, order, titles).
- `Main.dc.html`: Collections tab. The tab bar is Collections, AR Deposits, Need attention (the AR tab was dropped on 2026-11-10, as in the app). Interactive: the amount button (Full amount, Deposits, All), Show Not Due Yet, sorting by Next Follow Up, Payment Overdue and Amount Overdue.
- `CollectionsNotDue.dc.html`: `Main` with Show Not Due Yet on.
- `Invoice.dc.html`: invoice page. Header (Open Q/I, Open PDF, Customer view, Record Payment, Status), the Information and Messages tabs, the New Task button with its floating window, the delete-task confirmation, the Previous / Next Task margin buttons, and the customer view (Approved Quote, Signed Contract, Pay Invoice). Interactive: Yes on the confirmation removes the task row and renumbers the table.
- `InvoiceDeleteTask.dc.html`: `Invoice` with the delete confirmation open for task #2.
- `InvoiceWide.dc.html`: `Invoice` in a 1600 px window, where the Previous / Next Task buttons also sit in the margins (they appear from a 1440 px window up; narrower windows keep only the footer buttons, as the 1280 px boards show). Scroll the page in Play to see them follow.
- `InvoiceMessages.dc.html`: `Invoice` opened on Messages.
- `InvoiceNewTask.dc.html`, `InvoiceNewTaskPicker.dc.html`: `Invoice` with the New Task window open, and with its date picker open.
- `InvoiceCustomerQuote.dc.html`, `InvoiceCustomerContract.dc.html`, `InvoiceCustomerPay.dc.html`: `Invoice` with View customer page on, one file per customer tab.
- `Contacts.dc.html`: the three contact card layouts (both contacts, no finance contact, no company info).

## Notes

- Names, amounts and dates are made up. The Riverside Charity Run row and the invoice page agree (3 days overdue, C$1,735.75, "today" is Nov 10, 2026).
- The Status selector (Paid / Collections / Cancelled) from the sketch was removed on request, so the tab shows only the Collections list. Search and filters are not drawn either, because the sketch does not define them.
- Copy kept as written in the sketch, for example "3 months after".
- The Task History rows follow the same story: overdue since Nov 7, the first task finished 2 days ago, the second yesterday, the third is open and due today. The Signed line uses the contact's name and the Signed_Contract.pdf date; the time zone shown is the viewer's own.
- The sketch also draws a delete icon on the open task; the request says the open task has none, so the design follows the request.
- The amount button on the Collections tab sits left of Show Not Due Yet. Like the status button on `/quotes-bookings` it is one button that steps through its values on every click (Full amount, Deposits, All) and shows the current one; it opens on Full amount. The design draws only its place, label and colour change: the rows and the Amount Overdue column do not change with it, because what each mode lists is not defined yet.
- With five buttons in the header the name truncates with an ellipsis at 1040 px.
- The margin buttons are a pointer shortcut: they repeat the footer buttons, so they are hidden from assistive technology and skipped by Tab.
