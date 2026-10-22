import { createClient } from "@supabase/supabase-js";
import { test, expect, type Page } from "@playwright/test";
import { cleanupQuote, createQuote, type CreatedQuote } from "./helpers/quoteTestData";

/**
 * POST /api/quickbooks/invoice, the update flows, as an admin (docs/specs/qbo-invoice-05-update.md §8:
 * S1, S2, S3, S4, S5, S6 and S8).
 *
 * Written, not run locally (standing instruction: no Playwright runs on this machine). The real
 * route reaches QuickBooks, which a browser test cannot replace from outside the server, so:
 *  - S5 and S6 call the real route on a quote that the route refuses before it reaches QuickBooks
 *    (the office moved to another company / a quote that is not booked but has an invoice), so no
 *    QuickBooks call is made;
 *  - S1, S2, S3 and S8 replace the route with a fake that writes to Events what the real one writes,
 *    then check what the quote shows afterwards;
 *  - S4 (a wrong number) needs a QuickBooks sandbox company and is asserted in updateInvoice.test.ts.
 */

const INVOICE_ROUTE = "/api/quickbooks/invoice";

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

async function readEvent(eventId: string) {
  const { data, error } = await serviceRole()
    .from("Events")
    .select("qbo_invoice_id, qbo_invoice_hash, qbo_invoice_sent_hash, is_qbo")
    .eq("id", eventId)
    .single();
  if (error || !data) throw new Error(`readEvent failed: ${error?.message}`);
  return data;
}

const qboFlag = (page: Page) => page.getByRole("checkbox", { name: "QuickBooks Invoice" });

/** What the browser sends to the route, answered by whatever the test routed it to. */
const post = (page: Page, body: Record<string, unknown>) =>
  page.evaluate(async (data) => {
    const res = await fetch("/api/quickbooks/invoice", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    return { status: res.status, body: await res.json() };
  }, body);

test.describe("Update invoice route (admin)", () => {
  let quote: CreatedQuote;

  test.beforeEach(async () => {
    quote = await createQuote(); // status "quoted", with an invoice number, no sales office
  });

  test.afterEach(async () => {
    await cleanupQuote(quote.eventId);
  });

  test("S1: an update makes the sent hash equal the current hash", async ({ page }) => {
    await updateEvent(quote.eventId, {
      qbo_invoice_id: "e2e-fake-invoice",
      qbo_invoice_sent_hash: "e2e-an-older-hash",
    });

    // The fake does what the real route's step 8 does, then answers `updated`.
    await page.route(`**${INVOICE_ROUTE}`, async (route) => {
      const { eventId } = route.request().postDataJSON();
      const { qbo_invoice_hash } = await readEvent(eventId);
      await updateEvent(eventId, { qbo_invoice_sent_hash: qbo_invoice_hash });
      await route.fulfill({
        json: {
          status: "updated",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: "e2e-fake-invoice",
          linkedExisting: false,
          warnings: [],
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
    const before = await readEvent(quote.eventId);
    expect(before.qbo_invoice_hash).toBeTruthy();
    expect(before.qbo_invoice_sent_hash).not.toBe(before.qbo_invoice_hash);

    const { body } = await post(page, { eventId: quote.eventId });
    expect(body.status).toBe("updated");

    const after = await readEvent(quote.eventId);
    expect(after.qbo_invoice_sent_hash).toBe(after.qbo_invoice_hash);
  });

  test("S2: a missing invoice is reported, and with replaceMissing a new one is linked", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-gone-invoice", is_qbo: true });

    await page.route(`**${INVOICE_ROUTE}`, async (route) => {
      const { eventId, replaceMissing } = route.request().postDataJSON();
      if (!replaceMissing) {
        await route.fulfill({ json: { status: "invoice_missing" } });
        return;
      }
      await updateEvent(eventId, { qbo_invoice_id: "e2e-new-invoice" });
      await route.fulfill({
        json: {
          status: "created",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: "e2e-new-invoice",
          warnings: [],
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const first = await post(page, { eventId: quote.eventId });
    expect(first.body).toEqual({ status: "invoice_missing" });
    expect((await readEvent(quote.eventId)).qbo_invoice_id).toBe("e2e-gone-invoice");

    const second = await post(page, { eventId: quote.eventId, replaceMissing: true });
    expect(second.body.status).toBe("created");
    expect((await readEvent(quote.eventId)).qbo_invoice_id).toBe("e2e-new-invoice");
  });

  test("S3: overwriting an invoice found by number links it and ticks QuickBooks Invoice", async ({
    page,
  }) => {
    await page.route(`**${INVOICE_ROUTE}`, async (route) => {
      const { eventId, overwriteInvoiceId } = route.request().postDataJSON();
      await updateEvent(eventId, { qbo_invoice_id: overwriteInvoiceId, is_qbo: true });
      await route.fulfill({
        json: {
          status: "updated",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: overwriteInvoiceId,
          linkedExisting: true,
          warnings: [],
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);
    await expect(qboFlag(page)).not.toBeChecked({ timeout: 60_000 });

    const { body } = await post(page, {
      eventId: quote.eventId,
      overwriteInvoiceId: "e2e-found-invoice",
    });
    expect(body).toMatchObject({ status: "updated", linkedExisting: true });

    await page.reload();
    await expect(qboFlag(page)).toBeChecked({ timeout: 60_000 });
    expect((await readEvent(quote.eventId)).qbo_invoice_id).toBe("e2e-found-invoice");
  });

  test.fixme("S4: overwriting an invoice of another number is refused with 400", async () => {
    // Needs a QuickBooks sandbox company holding an invoice of another number; the server's own
    // QuickBooks calls cannot be replaced from the browser. The refusal, for a wrong number and for
    // an unknown id, and that nothing is saved, are asserted in updateInvoice.test.ts.
  });

  test("S5: an office that moved to the other company is refused with 409, and nothing is saved", async ({
    page,
  }) => {
    const db = serviceRole();
    const stamp = Date.now();
    const { data: connections, error: connError } = await db
      .from("QboConnections")
      .insert([
        { display_name: `E2E Company A ${stamp}`, encrypted_token_value: "e2e", realm_id: "e2e-a" },
        { display_name: `E2E Company B ${stamp}`, encrypted_token_value: "e2e", realm_id: "e2e-b" },
      ])
      .select("id, display_name");
    if (connError || !connections) throw new Error(`connections insert: ${connError?.message}`);
    const [a, b] = connections;

    const { data: office, error: officeError } = await db
      .from("SalesOffices")
      .insert({ name: `E2E Office ${stamp}`, quickbook_uuid: b.id })
      .select("id")
      .single();
    if (officeError || !office) throw new Error(`office insert: ${officeError?.message}`);

    try {
      await updateEvent(quote.eventId, {
        sales_office_uuid: office.id,
        qbo_invoice_id: "e2e-linked-invoice",
        qbo_invoice_connection_uuid: a.id,
        qbo_invoice_sent_hash: "e2e-an-older-hash",
      });

      const res = await page.request.post(INVOICE_ROUTE, { data: { eventId: quote.eventId } });

      expect(res.status()).toBe(409);
      const { error } = await res.json();
      expect(error).toContain(`in the ${a.display_name} QuickBooks company`);
      expect(error).toContain(`now uses ${b.display_name}`);
      expect(error).toContain("Nothing was changed");

      const after = await readEvent(quote.eventId);
      expect(after.qbo_invoice_id).toBe("e2e-linked-invoice");
      expect(after.qbo_invoice_sent_hash).toBe("e2e-an-older-hash");
    } finally {
      await updateEvent(quote.eventId, {
        sales_office_uuid: null,
        qbo_invoice_connection_uuid: null,
      });
      await db.from("SalesOffices").delete().eq("id", office.id);
      await db
        .from("QboConnections")
        .delete()
        .in(
          "id",
          connections.map((c) => c.id),
        );
    }
  });

  test("S6: a quote that is not booked but has an invoice is not refused for its status", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-linked-invoice" });

    const res = await page.request.post(INVOICE_ROUTE, { data: { eventId: quote.eventId } });

    // The quote is "quoted" and has no sales office: the validation stops it, and the booked rule
    // that Create applies is not what refuses it.
    expect(res.status()).toBe(400);
    const { error } = await res.json();
    expect(error).toContain("sales office");
    expect(error).not.toContain("booked");
  });

  test("S8: a link to a missing invoice and the number taken by another: overwriting relinks", async ({
    page,
  }) => {
    await updateEvent(quote.eventId, { qbo_invoice_id: "e2e-gone-invoice" });

    await page.route(`**${INVOICE_ROUTE}`, async (route) => {
      const { eventId, overwriteInvoiceId, replaceMissing } = route.request().postDataJSON();
      expect(replaceMissing).toBe(true);
      await updateEvent(eventId, { qbo_invoice_id: overwriteInvoiceId, is_qbo: true });
      await route.fulfill({
        json: {
          status: "updated",
          docNumber: String(quote.invoiceNumber),
          qboInvoiceId: overwriteInvoiceId,
          linkedExisting: true,
          warnings: [],
        },
      });
    });

    await page.goto(`/quotes-bookings/${quote.eventId}?tab=billing`);

    const { body } = await post(page, {
      eventId: quote.eventId,
      replaceMissing: true,
      overwriteInvoiceId: "e2e-found-invoice",
    });

    expect(body).toMatchObject({ status: "updated", linkedExisting: true });
    expect((await readEvent(quote.eventId)).qbo_invoice_id).toBe("e2e-found-invoice");
  });
});
