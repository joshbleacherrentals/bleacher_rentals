# Accountant Collections 16: View customer page

Status: **Implemented 2026-11-03** (approved 2026-11-03 after a revision: the first draft of
2026-11-02 was approved, then the check against the code found that the app's frame wraps the
page: §2 last three bullets; the user's answers of 2026-11-03 are in §1, the changes are in §3 to
§8; what differs from the text is in §9). Not committed, not deployed; Playwright written, not
run.
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
- **It writes nothing to the event's activity log.** The "Are you still here?" prompt and the
  "quote changed" pop-up already stay away when a signed-in staff member has the page open (their
  hooks wait for Clerk and check the user). The activity records do not wait for Clerk, so this
  spec switches them off for an address with `embed=1` (user's answer 2026-11-03, below).
- **Sign works for real**, as for the customer: it saves the signature, makes the event booked and
  sends the "quote signed" e-mails to the customer and the account manager. The accountant can
  therefore sign for the customer.
- **Pay opens Stripe in a new tab** (Stripe's page does not open inside a frame). The payment is
  real.
- **To make the three tabs live in the header,** the customer page gets an "embedded" mode: it
  hides its own tab bar (and the EN / FR switch that sits in it), and the header's tabs tell it
  which tab to show.
- **The language is always English for the accountant** (user's answer 2026-11-02). The frame
  shows the page in English whatever the contact's preferred language, and the accountant cannot
  change it (the EN / FR switch is hidden). This is only what the accountant sees on screen: what
  Sign produces (the signed PDF, the e-mails to the customer and the account manager) is built
  from the contact's record, not from the page, so it keeps the contact's language as before.

**The user's answers of 2026-11-03** (to the three findings of §2, last three bullets; the invoice
stays on `/accountant/invoice?id=<id>` whatever is chosen):

- **The frame shows the bare customer page, without the app's frame.** A signed-in user who opens
  `/quote/<id>?embed=1` gets the page as a customer gets it: no Header, no Sidebar, no PowerSync,
  no redirect. (Asked: this, or keep the app's frame in the iframe and add `/quote` for the
  accountant; the second was not chosen.) The ordinary `/quote/<id>` is not changed: an admin or
  an account manager who opens it still sees it inside the app.
- **No activity records when the address has `embed=1`.** The page does not call the activity
  tracker at all in that case. (Asked: this, or wait for Clerk before writing; the second was
  not chosen, because it would also stop recording customers whose browser blocks Clerk.) A
  person who adds `?embed=1` by hand is not recorded either.
- **`/quote` is added to the accountant's allowed pages.** An accountant can open
  `/quote/<id>` by its address too, inside the app as an admin does. The same change makes the
  Show Customer View button on the Contract tab of a quote card work for an accountant (today it
  sends them to `/accountant`); the matrix says so (§3).

**Readings to confirm at review:**

- **How the page knows it is embedded:** `?embed=1` in the address **and** a parent frame. The
  server draws the page from the address alone (no flash of the tab bar inside the frame); after
  mount, if there is no parent frame (someone opened the address directly), the page shows its tab
  bar again so a visitor is never left without navigation.
- **How the app drops its frame for the embedded page:** the signed-in tree of `layout.tsx`
  (`Script`, `Toaster`, `TanstackProvider`, `DynamicSystemProvider`, `SignedInComponents`) moves
  unchanged into a new client component `SignedInShell`. It reads `usePathname()` and
  `useSearchParams()`: for a path starting with `/quote/` and `embed=1` it renders
  a plain `h-dvh overflow-y-auto` box around the page (not `AuthFallback`, whose box holds the
  scroll), otherwise the same tree as today. The layout has no access to the address' query, which is why this is a client
  component; server and first client render agree because both read the same address.
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
- **English in the frame means all of the page's own text:** the browser's saved language choice
  is ignored there, the "download PDF" link on Approved Quote asks for `lang=en`, and the Stripe
  page opened by Pay is asked for English. The customer's own link is unchanged: a French contact
  still sees French there.
- **A New Task window that is open stays open** when the toggle is switched on (it belongs to the
  page); the New Task button is not in the customer tab strip.
- **Pay in a new tab:** the payment page opens through `window.open`; if the browser blocks it the
  page shows its existing payment error text (no new text is added to the customer page, whose
  words all come from `quoteStrings.ts`).
- **Offline:** instead of the frame the page says "The customer page needs a connection.".
- **Matrix wording** is in §3; the accountant and admin gain "sign for a customer" and "start an
  online payment" in this place, and the accountant gains the customer's page by its address, so
  the Collections row says so.

## 2. Research findings

- The customer page is `src/app/quote/[eventUUID]/page.tsx` (server component, public route in
  `src/proxy.ts`): it builds `QuoteDocumentData` and renders `QuotePublicTabs`
  (`src/features/quotesAndBookings/pdf/`), which holds the sticky bar with the three tabs and the
  language switch, and the three tab bodies (all stay mounted, hidden by a class).
- `usePresenceCheck` and `useQuoteFreshness` return early unless Clerk has loaded and no user is
  signed in ("manager preview"). `useQuoteActivityTracker` returns early when `useAuth().userId`
  is set but does **not** wait for `isLoaded`; `ClerkProvider` in `src/app/layout.tsx` has no
  `dynamic` prop, so its first render has no user. What keeps a signed-in staff member out of the
  log today is the next bullet, not the tracker.
- **The app wraps the page for a signed-in user** (found 2026-11-03, when the spec was checked
  against the code). `src/app/layout.tsx` reads `auth()`; with a user it renders `Script`,
  `Toaster`, `TanstackProvider`, `DynamicSystemProvider` (PowerSync) and `SignedInComponents`
  (Header, Sidebar, a scrolling `<main>`) around every page, `/quote/<id>` included; without a
  user it renders `AuthFallback`, whose public branch is the bare page. `SignedInComponents` shows
  a spinner instead of the page until the user's access has loaded, which is why the tracker has
  a user when the page mounts. In an iframe the first draft of this spec would have shown the
  whole app inside the frame, with its own scroll.
- **A redirect for the accountant** (same finding): `accessConfig.ts` gives `admin` and
  `account_manager` the allowed path `/quote`, not `accountant`; `useAccessRedirect` in
  `SignedInComponents` replaces the address of any page outside the allowed paths with
  `config.defaultRedirect` (`/accountant`). A frame of an accountant would have loaded the
  Collections list instead of the customer page.
- **If the app's frame is dropped for the embedded page** (the user's choice, §1), `SignedInComponents`
  no longer holds the page back, and the tracker would run with no user on the first render and
  record `client_page_view` for the accountant. Hence the switch-off by `embed=1` in §3.
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
- The design: the Customer view button (`aria-pressed`) in the header, the customer tabs in the bar, the three
  customer boards (`InvoiceCustomerQuote`, `InvoiceCustomerContract`, `InvoiceCustomerPay`).

## 3. Design

- **`src/features/quotesAndBookings/pdf/quoteEmbed.ts`** (new): the protocol, shared by both sides.
  `EMBED_PARAM = "embed"`, `EmbedTab = "quote" | "contract" | "pay"`, `parseEmbedTab(raw)`,
  messages `{ type: "quote-embed:set-tab", tab }` (parent to frame) and
  `{ type: "quote-embed:ready" }`, `{ type: "quote-embed:height", height }` (frame to parent),
  `parseToChild(data)`, `parseToParent(data)` (anything else gives `null`),
  `isSameOriginFrom(event, expectedSource)`, `isEmbeddedQuotePage(pathname, searchParams)` (true
  for a path starting with `/quote/` and `embed=1`; the one test the app's shell and the page
  share) and `trackUnlessEmbedded(embedded, track)` (returns `track`, or a function that does
  nothing when `embedded`).
- **`src/components/SignedInShell.tsx`** (new, client): the signed-in tree that `layout.tsx` has
  today, moved here unchanged (`Script` with the Google Maps key, `Toaster`, `TanstackProvider`,
  `DynamicSystemProvider`, `SignedInComponents`). Props `{ children }`. With
  `isEmbeddedQuotePage(usePathname(), useSearchParams())` it renders
  `<div className="h-dvh overflow-y-auto">{children}</div>` instead, the bare page: no Header, no Sidebar, no PowerSync, no `useAccessRedirect`.
- **`src/app/layout.tsx`** (changed): `userId ? <SignedInShell>{children}</SignedInShell> :
<AuthFallback>{children}</AuthFallback>`; nothing else moves.
- **`src/features/userAccess/accessConfig.ts`** (changed): `/quote` is added to the accountant's
  `allowedPaths`, after `/qbo-quote-types` and before `/permissions`; the comment above the list
  that says admin and account manager "have that prefix" is corrected. `/accountant` stays first.
- **`src/app/quote/[eventUUID]/page.tsx`** (changed): reads `searchParams` (`embed`, `tab`) and
  passes `embedded` and `initialTab` to `QuotePublicTabs`.
- **`src/features/quotesAndBookings/pdf/QuotePublicTabs.tsx`** (changed): the props `embedded` and
  `initialTab`. When embedded and framed: no sticky bar; the active tab comes from the parent's
  `set-tab` messages (accepted only from `window.parent` on the same origin); on mount it posts
  `ready`, and posts `height` (rounded up) from a `ResizeObserver` on the page root. The language
  there is always `en`: the page uses `const shownLanguage = embeddedAndFramed ? "en" : language`
  everywhere it uses `language` today (the texts, the PDF link, the pop-ups, the child tabs), so
  the contact's language and the saved browser choice are ignored; the `language` state itself is
  untouched, so a direct visit with `?embed=1` and no frame keeps its own language. The tracker
  the page hands to its tabs, its view and the modals is `trackUnlessEmbedded(embedded,
useQuoteActivityTracker(data.eventId))`: with `embed=1` in the address (framed or not) nothing
  is recorded, not even the first `client_page_view`. Not embedded: nothing changes.
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
- **`src/features/accountantCollections/components/InvoiceHeader.tsx`** (changed): the Customer
  view button (a toggle button: `aria-pressed`, an eye icon and the label "Customer view") next to
  Open PDF; props `customerView`, `onToggleCustomerView`.
- **`src/features/accountantCollections/components/InvoicePage.tsx`** (changed): state
  `customerViewFor: string | null` (on when it equals the event id, so another event resets it)
  and `customerTab`; with the toggle on, the tab strip is a `tablist` "Customer page sections"
  with Approved Quote, Signed Contract, Pay Invoice, the body is `CustomerPageFrame`, and the
  Previous / Next Task footer is hidden.
- **`src/features/userAccess/permissionPageData.ts`** (changed): in the Collections description
  add: "A Customer view button shows the page the customer sees (Approved Quote, Signed
  Contract, Pay Invoice); signing there signs for the customer and Pay opens the online payment
  in a new tab." In the admin and accountant notes, after the existing sentence: "Can open the
  customer's page on an invoice, with Show Customer View on a quote, or by its address, sign for
  the customer there, and start an online payment." (An admin already could open the page by its
  address and from the quote; the sentence states it for both roles in one place.)

## 4. Behaviour scenarios

Playwright, written, **not run**. Roles: accountant, admin. S41 to S48.

- **S41** the toggle is off by default; switching it on shows the three customer tabs and the
  frame; the header keeps its buttons; the footer is gone; switching it off returns.
- **S42** each customer tab shows its page in the frame; no tab bar of its own and no EN / FR
  switch inside the frame; **no Header or Sidebar of the app and no Collections list inside the
  frame, whichever of the two roles opens it**; the invoice page, not the frame, scrolls; for a
  contact whose language is French the frame's text is English.
- **S43** opening the frame adds no `client_page_view` or `client_tab_change` row to the event's
  activity log, and shows no "Are you still here?" or "quote changed" pop-up; the same for
  `/quote/<id>?embed=1` opened directly.
- **S44** Sign in the frame signs (seeded quote): the signature exists, the status badge follows
  after the sync, Open PDF (spec 15) now opens the signed file.
- **S45** Pay in the frame opens a new tab (`create-checkout` answered by a stub address); the
  invoice page stays.
- **S46** Previous / Next Task resets the toggle; an open New Task window survives switching the
  toggle on.
- **S47** `/quote/<id>?embed=1` opened directly (no frame) still shows its tab bar.
- **S48** the accountant opens `/quote/<id>` by its address, and with Show Customer View on the
  quote's Contract tab: the page opens inside the app (Header and Sidebar), with no redirect to
  `/accountant`. A visitor who is not signed in sees the page as before.

## 5. Tests

Red first.

- **`quoteEmbed.test.ts`:** `parseEmbedTab` (the three values, anything else `null`);
  `parseToChild` / `parseToParent` (valid, wrong type, wrong tab, non-numeric or negative height,
  not an object); `isSameOriginFrom` (other origin, other source); `isEmbeddedQuotePage` (true for
  `/quote/<id>` with `embed=1`; false without it, with `embed=0`, and for any path outside
  `/quote/` such as `/accountant/invoice` or `/quotes-bookings/<id>` with `embed=1`);
  `trackUnlessEmbedded` (embedded: the given function is never called; not embedded: it is, with
  the same event).
- **`SignedInShell` markup test** (next/navigation, `Header`, the providers and
  `SignedInComponents` mocked): embedded renders the page without the shell and without the
  providers; the same path without `embed=1`, and any other path, renders the shell.
- **`accessConfig.test.ts`:** the exact accountant list gains `/quote`; an accountant, an admin and
  an account manager can open `/quote/<id>`; a viewer, maintainer, developer and driver still
  cannot; the merged list of an account manager who is also an accountant is unchanged.
- **`PayInvoiceTab` `startCheckout` test:** embedded opens a new tab and clears the opener, not
  embedded assigns the address, a blocked tab reports the pay error.
- **`QuotePublicTabs` markup test** (the project's sample quote data): embedded and framed has no
  tab bar; not embedded has it; `initialTab` selects the visible body; embedded and framed with a
  French contact renders English text, not embedded with the same contact renders French.
- **`CustomerPageFrame` markup test:** the frame's `title`, the `src` with `embed=1` and the tab,
  the loading text; a pure `onFrameMessage` function: `ready` returns the tab to send, `height`
  below 480 is raised, a foreign message is ignored.
- **`InvoicePage` / `InvoiceHeader` tests:** the toggle is off by default; with it on, the three
  customer tabs, no footer; the toggle belongs to its own event id.
- **`noHardcodedText.test.ts`** keeps passing (it scans `pdf/` and `src/app/quote/`;
  `SignedInShell` is outside them). **`permissionPageData.test.ts`:** the new sentences; the test
  that compares the accountant's Collections note word for word is updated to the new note.
- **Gate:** `npm run tc`, `npx vitest run`, `prettier --check` on touched files (never on the
  design files). E2E: written, **SKIPPED** (not run locally, by instruction).

## 6. Files

**Counted: 10 files** (limit 10): `pdf/quoteEmbed.ts`, `components/CustomerPageFrame.tsx` and
`src/components/SignedInShell.tsx` (new), `src/app/quote/[eventUUID]/page.tsx`,
`pdf/QuotePublicTabs.tsx`, `pdf/PayInvoiceTab.tsx`, `components/InvoiceHeader.tsx`,
`components/InvoicePage.tsx`, `src/app/layout.tsx` and `src/features/userAccess/accessConfig.ts`
(changed). The last three are the 2026-11-03 additions. **Not counted:** the tests, the
Playwright specs, `permissionPageData.ts`. Nothing in the database, the sync rules or
`AppSchema.ts`.

## 7. Edge cases and error handling

- **A visitor adds `?embed=1` to the public address.** With no parent frame the page shows its tab
  bar as usual; with a parent frame of another site, messages from it are ignored (other source or
  origin) and the page only loses its own tab bar.
- **Clerk in the frame.** The page records nothing when the address has `embed=1`, so it no longer
  depends on Clerk reaching the frame; the S43 scenario guards this. The presence prompt and the
  "quote changed" pop-up still depend on Clerk having loaded and found a user; if Clerk fails to
  load they stay silent (the same failure direction as today).
- **A visitor who adds `?embed=1` by hand** is not recorded in the activity log, and, signed in,
  sees the page without the app around it. With no frame it still shows its tab bar (above).
- **The signed-in tree is built by `SignedInShell`** after the change: a mistake in the move
  would show on every page of the app, so the first check of the work is that a signed-in visit of
  an ordinary page (for example `/accountant`) renders the same Header, Sidebar and providers as
  before.
- **Frame or no frame, `/quote/<id>/payment-success` and the other pages under `/quote/` are not
  affected:** only `embed=1` changes the shell.
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
  accountant's visits, the Previous / Next footer in the customer view, removing the app's frame
  from the ordinary `/quote/<id>` (an admin or an account manager still sees it inside the app),
  changing the page's presence and freshness hooks.

## 9. Implementation notes (2026-11-03)

What differs from the text above, and why:

- **Pay opens a new tab only when the page is framed.** `QuotePublicTabs` gives
  `PayInvoiceTab` `embedded={embeddedAndFramed}`, not the bare `embed=1` flag: a visitor who
  opens `?embed=1` directly, with no frame, keeps the ordinary redirect to Stripe, since Stripe's
  page can be shown there. The activity switch-off still follows `embed=1` alone, as decided.
- **`initialTab` is honoured only for an embedded address.** `page.tsx` passes it when `embed=1`;
  an ordinary customer link with `?tab=pay` is unchanged ("Not embedded: nothing changes").
- **Exports added for tests** (no contract of the spec changed): in `quoteEmbed.ts` the constant
  `TAB_PARAM` and the types `ToChildMessage` and `ToParentMessage`; in `CustomerPageFrame.tsx`
  `frameSrc`, `MIN_FRAME_HEIGHT`, `FrameAction` and `CustomerPageFrameView` (the loading and
  offline markup, which a server-side test cannot reach through the online hook); in
  `InvoicePage.tsx` `customerViewForEvent` (the reset rule, same shape as `windowOpenForEvent`) and
  `CustomerTabs` (the customer tab strip). `startCheckout` returns `true` when it started and
  `false` for a blocked tab; the page sets `payError` from that.
- **`isSameOriginFrom` reads `globalThis.location.origin`** (the spec gave it two arguments, and it
  still has two); the test stubs `location`.
- **Test gap: "with the switch on, no footer" is not a unit test.** The project has no DOM test
  renderer and a server-side render cannot press the switch, so the unit tests cover the button
  (not pressed by default, `aria-pressed`), the reset rule and the customer tab strip; the footer and the
  New Task button disappearing is covered by S41, written, not run.
- **E2E helper additions** (`collectionsFixtures.ts`, not in §6; the e2e helpers do not count):
  `addContractTerms`, `addFrenchContact`, `clientActivityOf`, `activeSignaturesOf`, and
  `cleanupBookings` also removes the terms and the contact they made. The scenarios are written
  once in `helpers/customerPageViewTests.ts` and run as the accountant and as the admin by
  `customerPageView.accountant.spec.ts` and `customerPageView.admin.spec.ts`; S48 is two tests
  (the address and Show Customer View; a visitor who is not signed in).
- **Counted files: 10**, as in §6 (the 3 new, the 7 changed). The test files, the Playwright
  files and `permissionPageData.ts` are not counted.
- **Checked by hand:** the public page for a visitor not signed in, on the running dev server:
  `embed=1` has no tab bar and shows the tab of `tab=` (quote, contract, pay); `embed=0` and a
  plain address keep the bar. **Not checked in a browser:** the signed-in shell (`SignedInShell`),
  the frame's messages, Sign, Pay, the offline text, and S43 (no activity rows): they wait for the
  Playwright run or a manual one.

## 10. Changes after the first try (2026-11-03)

The user tried the page and asked for two changes. Both are made and recorded here; the text of
§1 to §3 is corrected where it named the old behaviour.
The label and the header layout of the second and third items were replaced the same day by the
redrawn header of §11; the scroll fix stands.

- **A wheel over the frame now scrolls the invoice page.** The frame's box was `AuthFallback`'s
  public box, which carries `overscroll-contain`: a frame as tall as its page cannot scroll, and
  `overscroll-contain` stops the scroll from going on to the invoice page, so it worked only with
  the pointer outside the frame. `SignedInShell` now renders its own `h-dvh overflow-y-auto` box
  for the embedded page, with no `overscroll-contain`; `AuthFallback` is not used for it any more
  (§1 reading and §3 corrected). The customer's own page keeps `AuthFallback` as before.
- **The switch reads "Customer page"** (was "View customer page"), by the user's request: the
  header row was too wide with the longer label. The feature's name in §0 and in the file name
  stays. The matrix sentence names the switch by its label, so it now reads "A Customer page switch
  shows ..." (and its test and the Playwright locator).
- **The header's buttons stay at the right of the name.** The row still wraps, but the name's box
  is now `min-w-[16rem] flex-1` and the buttons' group `shrink-0`, so a long name wraps inside its
  box (the "N days overdue" text goes under it) before the buttons drop to a line of their own.
  With the example the user showed (an event name of 29 characters and "100 days overdue", in a
  963 px header) the four buttons, about 530 px wide with the shorter label, do not fit on the name's
  line, so "100 days overdue" sits under the name; the buttons stay at the right.
- **Not checked in a browser:** the Chrome extension was not connected and the built-in browser
  was not allowed on localhost. The unit tests check the classes and the markup.

## 11. The header redrawn (2026-11-03)

The user redrew the header's buttons in `docs/design/accountant-collections/Invoice.dc.html` and
asked for the page to follow it. This replaces the label and the layout of §10 (the scroll fix of
§10 stays).

- **The switch is now a button.** "Customer view" with an eye icon (`Eye`), `aria-pressed` instead
  of `role="switch"` and `aria-checked`; outlined (`border-white/55`, no fill) when not pressed,
  filled `bg-lightBlue` with a `border-lighterBlue` edge when pressed; 36 px tall, `rounded-md`,
  `px-3.5`, 14 px medium, white, label on one line. The props `customerView` and
  `onToggleCustomerView` are unchanged. The old labels, "View customer page" and "Customer page",
  are gone from the button; the iframe's `title` ("Customer page") and the tab list's name
  ("Customer page sections") are not the button's label and stay.
- **One row.** The row no longer wraps; only on a window of 820 px or less do the row and the group
  of buttons wrap (`max-[820px]:flex-wrap`, as the design's media query). The name's box takes the
  room the buttons leave (`flex-auto`, `min-w-0`) and does not wrap; a long name is cut with an
  ellipsis (`truncate`) and "N days overdue" keeps its whole text (`shrink-0`, `whitespace-nowrap`).
  The buttons' group does not shrink (`shrink-0`) and keeps 8 px between buttons. This replaces
  the "days overdue moves under the name" of §10.
- **Open PDF** has 8 px between icon and label (was 6) and a label that does not wrap
  (`OpenPdfButton.tsx`, a file of spec 15; its look test is added).
- **Matrix** sentence: "A Customer view button shows ..." (and its test). The Playwright locator
  is `getByRole("button", { name: "Customer view" })` and checks `aria-pressed`.
- **Counted files:** still 10; `OpenPdfButton.tsx` is outside this spec's list and is changed for
  the look only.
- **Not checked in a browser** (Chrome extension not connected, built-in browser not allowed on
  localhost): the markup and the classes are tested, the look is not.
