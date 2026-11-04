import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

/**
 * Marks an email that was being sent as failed, with the reason to show on it. Only an email still
 * 'sending' changes: if the server already finished it, that stands.
 */
export async function markEmailFailed(id: string, reason: string): Promise<void> {
  await typedExecute(
    db
      .updateTable("EmailMessages")
      .set({ status: "error", error_text: reason.slice(0, 1000) })
      .where("id", "=", id)
      .where("status", "=", "sending")
      .compile(),
  );
}

/**
 * Throws away an email that was never sent (a draft, one that failed, one still sending). A sent
 * or received email is never deleted. Its body and its link to the contact go with it on the server
 * and reach this device when it syncs.
 */
export async function discardUnsentEmail(id: string): Promise<void> {
  await typedExecute(
    db
      .deleteFrom("EmailMessages")
      .where("id", "=", id)
      .where("status", "in", ["draft", "sending", "error"])
      .compile(),
  );
}
