# Quote send confirmation

Sending a quote to a customer becomes a deliberate two-step action: review it, then send it. A
shared dialog shows what the customer will receive, sends with a visible loading state, and only
shows the check-mark animation once the server confirms.

Status: **Approved** — 2026-09-23, with the decisions in section 7. Section 2.1 and the preview
route in section 3 were revised after approval (see 2.1); nothing else changed.

## 1. Every way a quote reaches a customer

Audited across the UI, API routes, edge functions, DB triggers, cron and automatic emails.

| #   | Entry point                                                             | Today                                                 |
| --- | ----------------------------------------------------------------------- | ----------------------------------------------------- |
| 1   | `CreateQuoteForm.tsx` `handleSendQuote` — "Send Quote →"                | Sends immediately after validation. No confirm.       |
| 2   | `QuoteDetailView.tsx` `handleSendToClient` — "Send To Client"           | `window.confirm` naming the recipients only.          |
| —   | `POST /api/quotes/[id]/send` — the only server sink; both paths call it | Auth check only. No role check, no double-send guard. |

**Nothing else sends a quote.** No DB trigger, cron job, edge function, QuickBooks call or status
change emails a quote. Setting a quote to "quoted" elsewhere sends nothing. The reminder emails
(`quote_unsigned_reminder`, `payment_due_*`) are unwired in `automaticEmails/triggers.ts`; if they
are ever switched on they become a third, automatic path and must be reviewed then.

Not quote delivery, but customer-facing and out of scope: `quote_signed_client` and
`payment_made_client` (fire after the customer acts), and the public link `/quote/[id]`, which is
reachable from "Show Customer View" but never emailed by it.

Because both UI paths call the same route, the confirmation lives in **one shared component** used
by both. That is what guarantees no path is left unguarded.

## 2. Behaviour

Clicking **Send Quote →** / **Send To Client** no longer sends. It opens `SendQuoteDialog`:

1. **Review phase.** Shows From, To (including any finance contact), the subject, the rendered email
   body (read-only, in a sandboxed iframe), and a labelled **Attachments** section where each file
   is a link that opens in a new tab: the quote PDF (`/api/quotes/{id}/pdf`, in the contact's
   preferred language, exactly what is attached) and any template files (signed, one-hour links).
   There is no embedded PDF viewer. Buttons:
   **Cancel** and **Send**. The email body cannot be edited.
2. **Sending phase.** Send becomes a spinner, the dialog cannot be dismissed, buttons disabled.
3. **Sent phase.** Only on a successful response: the `Success.json` Lottie check mark
   (`loop={false}`, as in `PaymentSuccessView`) and "Quote sent to …". A **Done** button closes it.
4. **Error phase.** On any failure: the server's message, and **Try again** / **Close**. The quote
   is not reported as sent.

The dialog is the single place that calls the route, so the loading and error handling is written
once instead of twice.

### 2.1 Create-quote flow

Order changes: validate, then save the quote **unchanged** (status is not touched) and open the
dialog. The preview PDF and email are built from the saved quote, so the save has to happen first —
the same thing the existing Preview PDF button does. Cancelling leaves a saved, unsent draft.
The status becomes `quoted` **only when Send is pressed**, immediately before the email. If that
succeeds but the email fails, the status is already `quoted`; the error phase says so plainly
("Saved as Quoted, but the email did not send") and offers Try again rather than the current
success-style toast. On Done, the form resets and navigates to the quote, as today.

### 2.2 Detail flow

Replaces `window.confirm`. Nothing is saved; the dialog sends the existing quote.

### 2.3 Recipients

The two paths currently compute recipients differently (create form: `companyEmail ||
contactName` + finance; detail: contact + finance). Both will now pass the same shape into the
dialog, and the dialog shows exactly what will be posted. No recipient means Send is disabled
with a reason, instead of a silent save-only.

## 3. Types

```ts
// src/features/quotesAndBookings/components/sendQuote/SendQuoteDialog.tsx
type SendQuoteDialogProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  eventId: string; // must already be saved; the create flow saves before opening
  recipientEmails: string[];
  onBeforeSend?: () => Promise<void>; // create flow: set status to quoted, just before sending
  onSent: () => void; // logs EventChangeLog (logQuoteSentLocal) + parent cleanup
};
type SendPhase = "review" | "sending" | "sent" | "error";
```

```ts
// src/app/api/quotes/[id]/send-preview/route.tsx   GET ?recipients=a@x.com,b@x.com
// Same auth as the send route (signed in). Resolves the email exactly as sending does.
type SendPreview =
  | {
      ok: true;
      from: string;
      to: string;
      subject: string;
      htmlBody: string;
      attachments: { name: string; url: string }[];
    }
  | { ok: false; reason: string }; // e.g. no active template, no sales office
```

`sendTriggerEmail` is split so the preview and the send share one resolver
(`resolveTriggerEmail`): what is previewed cannot drift from what is sent. When the preview
reports `ok:false`, Send is disabled and the reason is shown.

```ts
// src/features/quotesAndBookings/utils/sendQuote.ts
export async function postSendQuote(
  eventId: string,
  recipientEmails: string[],
): Promise<{ ok: true } | { ok: false; message: string }>;
```

No DB or PowerSync schema changes.

## 4. Permissions

No change to who may send: still admins and account managers, gated in the UI as today. No
`permissionPageData.ts` entry changes. The server route has no role check, so a signed-in viewer or
driver could still POST to it directly. **Deferred by decision (2026-09-23)** — to be done later.
The new preview route has the same sign-in-only check for the same reason.

## 5. Edge cases

- Double click / double send: Send is disabled from click until the response; the dialog cannot be
  closed mid-send.
- Tab closed mid-send: the server still sends and records `EventEmailLog`; the local
  `EventChangeLog` row is written only on success. Unchanged from today.
- Office has no active email template: `sendTriggerEmail` returns `sent:false`; shown in the error
  phase, never a check mark.
- Offline: the send needs the server, so the dialog shows the error phase. PowerSync is not
  involved in the send itself.
- Clerk session expired: the route returns 401; shown as the error phase with a "sign in again"
  message.
- PDF preview fails to load: the iframe area shows a fallback, and Send is still allowed (the
  preview is informational; the server builds its own PDF).

## 6. Tests

- Vitest: `postSendQuote` (ok, non-ok with `error` body, network throw); a recipient helper shared
  by both call sites; `SendQuoteDialog` phases with a mocked `fetch` (review → sending → sent;
  error → retry; Send disabled with no recipients; not dismissable while sending).
- Playwright (`sendQuote.am.spec.ts`, only when you say it may run): clicking Send Quote opens the
  dialog and sends nothing; Cancel leaves the quote unsent; Send shows the check mark.

## 7. Decisions

1. Preview also renders the email body, read-only. **Yes.**
2. Server-side role check. **Not now**, later.
3. Preview PDF language: the quote's stored language (the contact's `preferred_language`, which the
   PDF route and the send route already use). No EN/FR switch.
