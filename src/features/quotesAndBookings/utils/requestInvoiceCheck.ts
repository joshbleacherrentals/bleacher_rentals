import { db, powerSyncDb } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";

/**
 * After a Save, asks the server to compare the quote with its QuickBooks invoice (the check route).
 * The Save wrote to the local database; the route reads Supabase, so the request waits until
 * everything has been uploaded, or it would compare the quote as it was before the Save.
 * Fire-and-forget like `postFinanceBookedNotice`: the save has already succeeded, so nothing here
 * may fail it, and nothing is shown.
 * Spec: docs/specs/qbo-invoice-06a-check-on-save.md §4
 */

const UPLOAD_POLL_MS = 500;
const UPLOAD_WAIT_MAX_MS = 10_000;

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

/**
 * Whether the upload queue is empty, polling it until it is: false when `maxMs` has passed and it
 * still is not. The queue and the clock are passed in so it is tested without PowerSync.
 */
export async function waitForEmptyUploadQueue(input: {
  pending: () => Promise<number>;
  sleep: (ms: number) => Promise<void>;
  intervalMs?: number;
  maxMs?: number;
}): Promise<boolean> {
  const { pending, intervalMs = UPLOAD_POLL_MS, maxMs = UPLOAD_WAIT_MAX_MS } = input;
  let waited = 0;
  for (;;) {
    if ((await pending()) === 0) return true;
    if (waited >= maxMs) return false;
    await input.sleep(intervalMs);
    waited += intervalMs;
  }
}

/** The checks under way in this tab, by event: a second ask for the same quote joins the first. */
const running = new Map<string, Promise<void>>();

async function check(eventId: string): Promise<void> {
  try {
    const rows = await typedGetAll(
      db.selectFrom("Events").select("qbo_invoice_id").where("id", "=", eventId).compile(),
      expect<{ qbo_invoice_id: string | null }>(),
    );
    // A quote with no invoice has nothing to compare.
    if (!rows[0]?.qbo_invoice_id) return;

    const uploaded = await waitForEmptyUploadQueue({
      pending: async () => (await powerSyncDb.getUploadQueueStats()).count,
      sleep,
    });
    // The quote reaches the server later; the next Save or Check again checks it.
    if (!uploaded) return;

    const response = await fetch("/api/quickbooks/invoice/check", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ eventId }),
    });
    if (!response.ok) {
      console.error(`The QuickBooks invoice check answered ${response.status}.`);
    }
  } catch (e) {
    console.error("Could not check the QuickBooks invoice:", e);
  }
}

/** Never rejects and shows nothing. */
export function requestInvoiceCheck(eventId: string): Promise<void> {
  const already = running.get(eventId);
  if (already) return already;

  const run = check(eventId).finally(() => running.delete(eventId));
  running.set(eventId, run);
  return run;
}
