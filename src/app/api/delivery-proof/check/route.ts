import { auth } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";
import { canCheckDeliveryNow } from "@/features/deliveryProof/logic/proofList";
import { runDeliveryProofsFromEnv } from "@/features/deliveryProof/server/runFromEnv";
import { resolveUserAccessForRequest } from "@/features/userAccess/logic/resolveUserAccessForRequest";

// A few Linxup calls of up to 8 s each.
export const maxDuration = 60;

const json = (body: unknown, status = 200) => NextResponse.json(body, { status });

/**
 * Check now on the Delivery Proof page: the same run as the daily cron, at once (every completed
 * work tracker of the last 7 days without a final proof). Administrators and account managers.
 */
export async function POST() {
  const { userId } = await auth();
  if (!userId) return json({ error: "Unauthorized" }, 401);
  const access = await resolveUserAccessForRequest(userId);
  if (access.status !== "active" || !canCheckDeliveryNow(access.roles)) {
    return json({ error: "Forbidden" }, 403);
  }
  try {
    const summary = await runDeliveryProofsFromEnv();
    console.log("[delivery-proof] check now:", JSON.stringify(summary));
    return json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[delivery-proof] check now failed:", message);
    return json({ error: message }, 502);
  }
}
