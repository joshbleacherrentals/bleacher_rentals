# Accountant Collections 16: View customer page

Status: **Draft 2026-11-02, waiting for "Approved"**; 0 open decisions, readings to confirm in §1.
Build order: **16** (last). Needs: [09](accountant-collections-09-design.md),
[12](accountant-collections-12-tabs-and-messages.md). Needed by: nothing. Branch:
`q4-sprint2-collections`.

## 0. The change request of 2026-11-02 (the same in all five specs)

This spec is one of five (12 to 16). They change the invoice page that specs 06 to 10 built,
after the author redrew its design. Each is built in its own chat, so this section is repeated
in every spec.

**The series** (`docs/specs/`, in build order):

- **12** `accountant-collections-12-tabs-and-messages.md`: the Messages tab and the New Task
  button join the tab bar.
- **13** `accountant-collections-13-task-history-and-files.md`: the Tasks tab goes; Task History
  and Files appear in Information.
- **14** `accountant-collections-14-new-task-window.md`: a floating New Task window replaces the
  Done / Next Task modal.
- **15** `accountant-collections-15-open-pdf.md`: the Open PDF button in the header.
- **16** `accountant-collections-16-customer-page-view.md`: the View customer page toggle.

**The request** (the author's numbered list of 2026-11-02, with their sketch and the redrawn
design):

1. The Tasks tab disappears; its table moves into the Information tab. In the tab bar a **New
   Task** button takes its place.
2. Between the Tasks tab and the New Task button comes a **Messages** tab, identical to the
   Messages tab of `/quotes-bookings/{id}?tab=messages`.
3. The header gets **Open PDF**: it opens the signed invoice PDF; if there is none, the quote PDF.
4. The header gets a **View customer page** toggle: on shows the customer's page, off is the page
   as it is now.
5. Information gets a **Task History** table (the tasks moved from the Tasks tab).
6. Information gets a **Files** table: the files attached to the quote / invoice.
7. **New Task** opens a draggable, resizable window, not a modal: the rest of the page stays
   usable (click, scroll) while it is open. Width and height resize separately, and dragging a
   corner changes both.

**Where the work is.** Branch `q4-sprint2-collections`. Design: `docs/design/accountant-collections/`
(README, `Invoice.dc.html` and its boards, redrawn 2026-11-02; never run Prettier on them) and the
author's sketch `Untitled-2026-11-02-1931.excalidraw` (not in the repository). Stack and rules:
`CLAUDE.md`, `docs/POWERSYNC_ARCHITECTURE.md`. Earlier series: specs 01 to 11 (09 built the page,
10 the Previous / Next Task links).

**What stays as built:** the Collections list, `useInvoiceData`, the header's Record Payment and
status badge, the Information cards, the Previous / Next Task footer, "Back to tasks", the table
`ArEventTasks` and its rules (one open task per event; the sync of spec 11), access for admin and
accountant only. Spec 09 is not edited; each spec of this series says which of its points it
replaces.

**Decisions taken by the user (they hold for the whole series):**

1. **Open task.** It is the last row of Task History, marked Open. There is no separate "current
   task" block.
2. **New Task** is enabled only when the event has an open task. It then completes that task and
   creates the next one (the Done / Next Task action of spec 06, unchanged; an event has at most
   one open task). Without an open task the button is disabled.
3. **The window** closes when the accountant moves to another event with Previous / Next Task;
   whatever was typed is lost. Its size and place are remembered in the browser.
4. **View customer page** shows the live page `/quote/<event id>` in a frame under the header. It
   writes nothing to the event's activity log. Sign works for real, as for the customer. Pay
   opens Stripe in a new tab.
5. **Files.** Download on every file; Delete only on files attached by hand (source `upload`).
   Attach File lists the chosen files and a Save button uploads them; there is no drag and drop.
6. **Not built:** Send Email, assigning tasks, anything the sketch does not draw.

## 1. What this spec decides

**From the user's own words (not options):**

- **A toggle "View customer page" in the header.** Off: the page as it is now. On: the three tabs
  of the customer's page, **Approved Quote**, **Signed Contract**, **Pay Invoice**, replace the
  Information / Messages / New Task bar, and the customer's page is shown under the header. The
  header (event name, N days overdue, Open PDF, the toggle, Record Payment, the status) stays.
- **The live page in a frame:** the same `/quote/<event id>` the customer sees, inside the invoice
  page (decision 4).
- **It writes nothing to the event's activity log.** (Nothing needs building for this: the public
  page already skips its activity records, the "Are you still here?" prompt and the "quote
  changed" pop-up when a signed-in staff member has it open, and the frame is opened by a signed-in
  accountant.)
- **Sign works for real**, as for the customer: it saves the signature, makes the event booked and
  sends the "quote signed" e-mails to the customer and the account manager. The accountant can
  therefore sign for the customer.
- **Pay opens Stripe in a new tab** (Stripe's page does not open inside a frame). The payment is
  real.
- **To make the three tabs live in the header,** the customer page gets an "embedded" mode: it
  hides its own tab bar (and the EN / FR switch that sits in it), and the header's tabs tell it
  which tab to show.

**Readings to confirm at review:**

- **How the page knows it is embedded:** `?embed=1` in the address **and** a parent frame. The
  server draws the page from the address alone (no flash of the tab bar inside the frame); after
  mount, if there is no parent frame (someone opened the address directly), the page shows its tab
  bar again so a visitor is never left without navigation.
- **How the two pages talk:** `postMessage` between the frame and the invoice page, same origin
  only. The frame says `ready` and reports its height; the invoice page sends the tab to show.
  The address also carries `tab=<quote|contract|pay>` for the first paint.
- **The frame grows to the page's height,** so only the invoice page scrolls, as the design draws
  (boards of 1400, 900 and 1300 pixels); until the first report it is 480 px tall under the text
  "Loading customer page…".
- **The toggle and the tab are not in the URL.** They start off / Approved Quote on every event
  and reset when the accountant moves to another event with Previous / Next Task (the footer is
  hidden while the toggle is on, as drawn). Switching the toggle off and on starts at Approved
  Quote.
- **The language is the contact's own** (the page's own rule); the EN / FR switch is hidden, so the
  accountant cannot change it.
- **A New Task window that is open stays open** when the toggle is switched on (it belongs to the
  page); the New Task button is not in the customer tab strip.
- **Pay in a new tab:** the payment page opens through `window.open`; if the browser blocks it the
  page shows its existing payment error text (no new text is added to the customer page, whose
  words all come from `quoteStrings.ts`).
- **Offline:** instead of the frame the page says "The customer page needs a connection.".
- **Matrix wording** is in §3; the accountant and admin gain "sign for a customer" and "start an
  online payment" in this place, so the Collections row says so.

## 2. Research findings

- The customer page is `src/app/quote/[eventUUID]/page.tsx` (server component, public route in
  `src/proxy.ts`): it builds `QuoteDocumentData` and renders `QuotePublicTabs`
  (`src/features/quotesAndBookings/pdf/`), which holds the sticky bar with the three tabs and the
  language switch, and the three tab bodies (all stay mounted, hidden by a class).
- `useQuoteActivityTracker`, `usePresenceCheck` and `useQuoteFreshness` each return early when
  `useAuth().userId` is set ("manager preview"). A frame on the same origin sends the Clerk cookie,
  so a signed-in accountant is a manager preview and nothing is logged. Verify once that no
  `client_page_view` row reaches `EventChangeLog`.
- Sign: `/api/contracts/sign` (no sign-in required): signature, status `booked`, `booked_at`, the
  signed PDF, two trigger e-mails, change-log lines `signature` and `status_change` (these are the
  app's normal change log, not the client activity records).
- Pay: `PayInvoiceTab` posts `/api/payments/create-checkout` and sets
  `window.location.href = json.url` (Stripe Checkout). Stripe does not allow its checkout page in a
  frame. The success and cancel addresses return to the app's own pages in that new tab.
- `noHardcodedText.test.ts` fails on any text in the files of `pdf/` and `src/app/quote/` that does
  not come from `quoteStrings.ts`: the embedded mode adds no text there.
- No `X-Frame-Options` or `frame-ancestors` header is set in `next.config.*` or `src/proxy.ts`, so
  the page can be framed. A future header would break this view.
- The design: the toggle (`role="switch"`) in the header, the customer tabs in the bar, the three
  customer boards (`InvoiceCustomerQuote`, `InvoiceCustomerContract`, `InvoiceCustomerPay`).

## 3. Design

- **`src/features/quotesAndBookings/pdf/quoteEmbed.ts`** (new): the protocol, shared by both sides.
  `EMBED_PARAM = "embed"`, `EmbedTab = "quote" | "contract" | "pay"`, `parseEmbedTab(raw)`,
  messages `{ type: "quote-embed:set-tab", tab }` (parent to frame) and
  `{ type: "quote-embed:ready" }`, `{ type: "quote-embed:height", height }` (frame to parent),
  `parseToChild(data)`, `parseToParent(data)` (anything else gives `null`), and
  `isSameOriginFrom(event, expectedSource)`.
- **`src/app/quote/[eventUUID]/page.tsx`** (changed): reads `searchParams` (`embed`, `tab`) and
  passes `embedded` and `initialTab` to `QuotePublicTabs`.
- **`src/features/quotesAndBookings/pdf/QuotePublicTabs.tsx`** (changed): the props `embedded` and
  `initialTab`. When embedded and framed: no sticky bar; the active tab comes from the parent's
  `set-tab` messages (accepted only from `window.parent` on the same origin); on mount it posts
  `ready`, and posts `height` (rounded up) from a `ResizeObserver` on the page root. Not embedded:
  nothing changes.
- **`src/features/quotesAndBookings/pdf/PayInvoiceTab.tsx`** (changed): a prop `embedded`; the
  redirect is a small pure function `startCheckout({ embedded, url, open, assign })`: embedded
  opens `url` in a new tab (and clears `opener`), otherwise assigns `location.href` as today; a
  blocked tab sets `payError` to `s.payError`.
- **`src/features/accountantCollections/components/CustomerPageFrame.tsx`** (new): props
  `{ eventId, tab }`. An `<iframe title="Customer page" src="/quote/<id>?embed=1&tab=<tab>">`
  whose address is fixed at mount (so a tab change does not reload it); it listens for the
  frame's messages (checked with `isSameOriginFrom`): on `ready` it sends the current tab, on
  `height` it sets the frame's height (never below 480); when `tab` changes it sends `set-tab`.
  The offline text and the loading text.
- **`src/features/accountantCollections/components/InvoiceHeader.tsx`** (changed): the toggle
  (`role="switch"`, `aria-checked`, label "View customer page") next to Open PDF; props
  `customerView`, `onToggleCustomerView`.
- **`src/features/accountantCollections/components/InvoicePage.tsx`** (changed): state
  `customerViewFor: string | null` (on when it equals the event id, so another event resets it)
  and `customerTab`; with the toggle on, the tab strip is a `tablist` "Customer page sections"
  with Approved Quote, Signed Contract, Pay Invoice, the body is `CustomerPageFrame`, and the
  Previous / Next Task footer is hidden.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description
  add: "A View customer page switch shows the page the customer sees (Approved Quote, Signed
  Contract, Pay Invoice); signing there signs for the customer and Pay opens the online payment
  in a new tab." In the admin and accountant notes: "Can open the customer's page on an invoice,
  sign for the customer there, and start an online payment."

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S41 to S47.

- **S41** the toggle is off by default; switching it on shows the three customer tabs and the
  frame; the header keeps its buttons; the footer is gone; switching it off returns.
- **S42** each customer tab shows its page in the frame; no tab bar of its own and no EN / FR
  switch inside the frame; the invoice page, not the frame, scrolls.
- **S43** opening the frame adds no `client_page_view` or `client_tab_change` row to the event's
  activity log, and shows no "Are you still here?" or "quote changed" pop-up.
- **S44** Sign in the frame signs (seeded quote): the signature exists, the status badge follows
  after the sync, Open PDF (spec 15) now opens the signed file.
- **S45** Pay in the frame opens a new tab (`create-checkout` answered by a stub address); the
  invoice page stays.
- **S46** Previous / Next Task resets the toggle; an open New Task window survives switching the
  toggle on.
- **S47** `/quote/<id>?embed=1` opened directly (no frame) still shows its tab bar.

## 5. Tests

Red first.

- **`quoteEmbed.test.ts`:** `parseEmbedTab` (the three values, anything else `null`);
  `parseToChild` / `parseToParent` (valid, wrong type, wrong tab, non-numeric or negative height,
  not an object); `isSameOriginFrom` (other origin, other source).
- **`PayInvoiceTab` `startCheckout` test:** embedded opens a new tab and clears the opener, not
  embedded assigns the address, a blocked tab reports the pay error.
- **`QuotePublicTabs` markup test** (the project's sample quote data): embedded and framed has no
  tab bar; not embedded has it; `initialTab` selects the visible body.
- **`CustomerPageFrame` markup test:** the frame's `title`, the `src` with `embed=1` and the tab,
  the loading text; a pure `onFrameMessage` function: `ready` returns the tab to send, `height`
  below 480 is raised, a foreign message is ignored.
- **`InvoicePage` / `InvoiceHeader` tests:** the toggle is off by default; with it on, the three
  customer tabs, no footer; the toggle belongs to its own event id.
- **`noHardcodedText.test.ts`** keeps passing. **`permissionPageData.test.ts`:** the new
  sentences.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files (never on the
  design files). E2E: written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 7 files** (limit 10): `pdf/quoteEmbed.ts` and `components/CustomerPageFrame.tsx` (new),
`src/app/quote/[eventUUID]/page.tsx`, `pdf/QuotePublicTabs.tsx`, `pdf/PayInvoiceTab.tsx`,
`components/InvoiceHeader.tsx` and `components/InvoicePage.tsx` (changed). **Not counted:** the
tests, the Playwright specs, `permissionPageData.ts`. Nothing in the database, the sync rules or
`AppSchema.ts`.

## 7. Edge cases and error handling

- **A visitor adds `?embed=1` to the public address.** With no parent frame the page shows its tab
  bar as usual; with a parent frame of another site, messages from it are ignored (other source or
  origin) and the page only loses its own tab bar.
- **Clerk in the frame.** If the session does not reach the frame, the page would log like a
  customer; the S43 scenario guards this.
- **A future `frame-ancestors` or `X-Frame-Options` header** would blank the frame; the S41
  scenario guards this.
- **The page changes inside the frame** (after Sign the content grows): the height report follows
  through the `ResizeObserver`.
- **The frame does not load** (server error, 404 for a missing quote): the frame shows the page's
  own error; the invoice page is unaffected.
- **A quote with no contract template or already signed:** the Signed Contract tab behaves as it
  does for the customer.
- **Sign by mistake:** it is a real signature; the accountant is responsible, which the matrix
  states. Nothing in the interface warns beforehand (the sketch draws no warning).
- **Offline:** the frame is replaced by the connection text; the rest of the page works locally.

## 8. Out of scope

- A read-only copy of the customer page, a warning before Sign, choosing the language, a link to
  open the customer page in its own tab (the quote card's Contract tab has one), logging the
  accountant's visits, the Previous / Next footer in the customer view.
