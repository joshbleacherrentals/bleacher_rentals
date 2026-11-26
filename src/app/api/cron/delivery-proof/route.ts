import { NextRequest, NextResponse } from "next/server";
import { runDeliveryProofsFromEnv } from "@/features/deliveryProof/server/runFromEnv";

// A few Linxup calls of up to 8 s each.
export const maxDuration = 60;

/**
 * Daily proof of delivery (vercel.json): checks recently completed work trackers against their
 * bleacher's Linxup GPS and records the result in DeliveryProofs. Called by Vercel Cron with
 * CRON_SECRET.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  try {
    const summary = await runDeliveryProofsFromEnv();
    console.log("[delivery-proof]", JSON.stringify(summary));
    return NextResponse.json(summary);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.error("[delivery-proof] failed:", message);
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
