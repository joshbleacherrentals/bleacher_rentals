import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * The Create invoice / Update invoice buttons on the Billing tab, as an admin
 * (docs/specs/qbo-invoice-07-card-buttons.md §6: S1, S2, S5, S6, S7, S8, S9, S10).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * route reaches QuickBooks, which a browser test cannot replace from outside the server, so every
 * test replaces it with a fake (`page.route`) that records what the screen sent and answers what the
 * scenario needs. What the route itself does is asserted in qboInvoiceCreate/Update.*.spec.ts.
 */

const INVOICE_ROUTE = "**/api/quickbooks/invoice";

function serviceRole() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

async function updateEvent(eventId: string, fields: Record<string, unknown>) {
  const { error } = await serviceRole().from("Events").update(fields).eq("id", eventId);
  if (error) throw new Error(`updateEvent failed: ${error.message}`);
}

type FakeAnswer = { status?: number; json: unknown };

/**
 * Replaces the invoice route. Returns the bodies the screen sent, in order; `answer` gets the body
 * and the number of the request (0 for the first).
 */
async function fakeRoute(page: Page, answer: (body: any, n: number) => FakeAnswer) {
  const sent: any[] = [];
  await page.route(INVOICE_ROUTE, async (route) => {
    const body = route.request().postDataJSON();
    sent.push(body);
    const { status = 200, json } = answer(body, sent.length - 1);
    await route.fulfill({ status, json });
  });
  return sent;
}

const billing = (quote: CreatedQuote) => `/quotes-bookings/${quote.eventId}?tab=billing`;
const createButton = (page: Page) => page.getByRole("button", { name: "Create invoice" });
const updateButton = (page: Page) => page.getByRole("button", { name: "Update invoice" });
const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });
/** Any window the buttons open (the update question, and the three of the flows). */
const dialog = (page: Page) => page.getByRole("dialog").or(page.getByRole("alertdialog"));

const createdAnswer = (quote: CreatedQuote, warnings: unknown[] = []): FakeAnswer => ({
  json: {
    status: "created",
    docNumber: String(quote.invoiceNumber),
    qboInvoiceId: "e2e-fake-invoice",
    warnings,
  },
});

const updatedAnswer = (quote: CreatedQuote, warnings: unknown[] = []): FakeAnswer => ({
  json: {
    status: "updated",
    docNumber: String(quote.invoiceNumber),
    qboInvoiceId: "e2e-fake-invoice",
    linkedExisting: false,
    warnings,
  },
});

const CANDIDATES = [
  { id: "C1", displayName: "Dana Whitfield", companyName: "Riverside High", email: "dana@r.edu" },
  { id: "C2", displayName: "Dana W.", companyName: null, email: null },
];

test.describe("Create and Update invoice buttons (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // "quoted", with an invoice number and no link
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test.describe("a booked quote with no invoice", () => {
    test.beforeEach(async () => {
      await updateEvent(quote.eventId, { event_status: "booked" });
    });

    test("S1: Create invoice shows the success toast, and the button becomes Update invoice at once", async ({
      page,
    }) => {
      // The fake writes nothing to Events: the flip can only come from the remembered answer.
      const sent = await fakeRoute(page, () => createdAnswer(quote));
      await page.goto(billing(quote));

      await expect(createButton(page)).toBeVisible({ timeout: 60_000 });
      await createButton(page).click();

      await expect(
        page.getByText(`Invoice ${quote.invoiceNumber} created in QuickBooks`),
      ).toBeVisible();
      await expect(updateButton(page)).toBeVisible();
      await expect(createButton(page)).toHaveCount(0);
      expect(sent).toEqual([{ eventId: quote.eventId }]);
    });

    test("S5: several customers: the window lists them, and 'Use this customer' re-sends with customerChoice", async ({
      page,
    }) => {
      const sent = await fakeRoute(page, (body, n) =>
        n === 0
          ? { json: { status: "choose_customer", candidates: CANDIDATES } }
          : createdAnswer(quote),
      );
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await expect(dialog(page).getByText("Dana Whitfield")).toBeVisible();
      await expect(dialog(page).getByText("Riverside High")).toBeVisible();
      await expect(dialog(page).getByText("dana@r.edu")).toBeVisible();
      await dialog(page).getByRole("button", { name: "Use this customer" }).nth(1).click();

      await expect(
        page.getByText(`Invoice ${quote.invoiceNumber} created in QuickBooks`),
      ).toBeVisible();
      expect(sent).toEqual([
        { eventId: quote.eventId },
        { eventId: quote.eventId, customerChoice: { kind: "existing", customerId: "C2" } },
      ]);
    });

    test("S5: 'Create a new customer' sends { kind: 'new' }", async ({ page }) => {
      const sent = await fakeRoute(page, (body, n) =>
        n === 0
          ? { json: { status: "choose_customer", candidates: CANDIDATES } }
          : createdAnswer(quote),
      );
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await dialog(page).getByRole("button", { name: "Create a new customer" }).click();

      await expect(
        page.getByText(`Invoice ${quote.invoiceNumber} created in QuickBooks`),
      ).toBeVisible();
      expect(sent[1]).toEqual({ eventId: quote.eventId, customerChoice: { kind: "new" } });
    });

    test("S5: Cancel on the customer window sends nothing more", async ({ page }) => {
      const sent = await fakeRoute(page, () => ({
        json: { status: "choose_customer", candidates: CANDIDATES },
      }));
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await dialog(page).getByRole("button", { name: "Cancel" }).click();

      await expect(dialog(page)).toHaveCount(0);
      await expect(createButton(page)).toBeVisible();
      expect(sent).toHaveLength(1);
    });

    test("S6: the number is taken: the window shows number, customer and total, and Overwrite sends overwriteInvoiceId", async ({
      page,
    }) => {
      const sent = await fakeRoute(page, (body, n) =>
        n === 0
          ? {
              json: {
                status: "invoice_number_exists",
                invoice: {
                  id: "e2e-found-invoice",
                  number: String(quote.invoiceNumber),
                  customerName: "Riverside High",
                  totalCents: 123456,
                },
              },
            }
          : { json: { ...(updatedAnswer(quote).json as object), linkedExisting: true } },
      );
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await expect(dialog(page)).toContainText(
        `An invoice numbered ${quote.invoiceNumber} already exists in QuickBooks (customer Riverside High, total $1,234.56).`,
      );
      await dialog(page).getByRole("button", { name: "Overwrite with this quote's data" }).click();

      await expect(page.getByText(`Invoice ${quote.invoiceNumber} updated`)).toBeVisible();
      expect(sent[1]).toEqual({ eventId: quote.eventId, overwriteInvoiceId: "e2e-found-invoice" });
    });

    test("S9: each warning is its own toast", async ({ page }) => {
      await fakeRoute(page, () =>
        createdAnswer(quote, [
          { code: "pdf_not_attached", reason: "disk full" },
          { code: "invoice_check_failed", reason: "timed out" },
          { code: "class_missing", state: "SC", reason: "no_class" },
          { code: "tax_code_missing", province: "ON" },
        ]),
      );
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await expect(
        page.getByText("The PDF was not attached (disk full). Press Update invoice to try again."),
      ).toBeVisible();
      await expect(
        page.getByText("The invoice could not be checked against the quote."),
      ).toBeVisible();
      await expect(
        page.getByText(
          "No QuickBooks Class was found for SC. The invoice was made without one; set the Class in QuickBooks.",
        ),
      ).toBeVisible();
      await expect(
        page.getByText(
          "No QuickBooks tax code is mapped for ON. The invoice was made without tax; map the code on the QuickBooks page, then press Update invoice.",
        ),
      ).toBeVisible();
    });

    test("S10: a route error shows its message, and the button is Create invoice again", async ({
      page,
    }) => {
      await fakeRoute(page, () => ({
        status: 502,
        json: { error: "QuickBooks refused the invoice" },
      }));
      await page.goto(billing(quote));
      await createButton(page).click({ timeout: 60_000 });

      await expect(page.getByText("QuickBooks refused the invoice")).toBeVisible();
      await expect(createButton(page)).toBeEnabled();
    });
  });

  test("S2: a quote that is not booked and has no invoice gets no button", async ({ page }) => {
    const sent = await fakeRoute(page, () => createdAnswer(quote));
    await page.goto(billing(quote));

    // The tab is up when the flag is: the buttons live right under it.
    await expect(qboFlag(page)).toBeVisible({ timeout: 60_000 });
    await expect(createButton(page)).toHaveCount(0);
    await expect(updateButton(page)).toHaveCount(0);
    expect(sent).toHaveLength(0);
  });

  test.describe("a quote with an invoice", () => {
    test.beforeEach(async () => {
      // Any status: this one is "quoted", which Create would refuse.
      await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-linked-invoice", is_qbo: true });
    });

    test("S7: Update invoice asks first; Cancel sends nothing, and confirming sends the update", async ({
      page,
    }) => {
      const sent = await fakeRoute(page, () => updatedAnswer(quote));
      await page.goto(billing(quote));
      await expect(createButton(page)).toHaveCount(0);

      await updateButton(page).click({ timeout: 60_000 });
      await expect(dialog(page)).toContainText("Update the QuickBooks invoice?");
      await expect(dialog(page)).toContainText(
        "This replaces its content with this quote's current data, including any change made by hand in QuickBooks.",
      );
      await dialog(page).getByRole("button", { name: "Cancel" }).click();
      await expect(dialog(page)).toHaveCount(0);
      expect(sent).toHaveLength(0);

      await updateButton(page).click();
      await dialog(page).getByRole("button", { name: "Update invoice" }).click();

      await expect(page.getByText(`Invoice ${quote.invoiceNumber} updated`)).toBeVisible();
      expect(sent).toEqual([{ eventId: quote.eventId }]);
    });

    test("S8: the invoice is gone: Yes sends replaceMissing and reports the new invoice", async ({
      page,
    }) => {
      const sent = await fakeRoute(page, (body, n) =>
        n === 0 ? { json: { status: "invoice_missing" } } : createdAnswer(quote),
      );
      await page.goto(billing(quote));
      await updateButton(page).click({ timeout: 60_000 });
      await dialog(page).getByRole("button", { name: "Update invoice" }).click();

      await expect(dialog(page)).toContainText(
        "The invoice linked to this quote was not found in QuickBooks. Create a new one?",
      );
      await dialog(page).getByRole("button", { name: "Yes" }).click();

      await expect(
        page.getByText(`Invoice ${quote.invoiceNumber} created in QuickBooks`),
      ).toBeVisible();
      expect(sent[1]).toEqual({ eventId: quote.eventId, replaceMissing: true });
    });

    test("S8: the invoice is gone: No shows the developer message and sends nothing", async ({
      page,
    }) => {
      const sent = await fakeRoute(page, () => ({ json: { status: "invoice_missing" } }));
      await page.goto(billing(quote));
      await updateButton(page).click({ timeout: 60_000 });
      await dialog(page).getByRole("button", { name: "Update invoice" }).click();

      await dialog(page).getByRole("button", { name: "No" }).click();

      await expect(
        page.getByText(
          "If the invoice was not deleted in QuickBooks, this is probably a bug — please tell the developer.",
        ),
      ).toBeVisible();
      expect(sent).toHaveLength(1);
    });
  });
});
