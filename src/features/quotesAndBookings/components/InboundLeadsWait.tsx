"use client";

import { usePathname, useRouter } from "next/navigation";
import { useInboundLeads } from "../hooks/useInboundLeads";
import { useInboundLeadsZones } from "../hooks/useInboundLeadsZones";
import { useNow } from "../hooks/useNow";
import { formatWait } from "../utils/formatWait";
import { inboundLeadsHref, SHOW_INBOUND_LEADS_EVENT } from "../utils/inboundLeadsHref";

/**
 * The app header's reminder of the inbound leads waiting: "6 New Leads!" and how long the oldest has
 * waited, counting up every second. For account managers and admins, and only while a lead waits.
 * It reads the same rows as the Inbound Leads pill (`useInboundLeads`). Clicking opens the quotes
 * list on that template.
 */
export function InboundLeadsWait() {
  const router = useRouter();
  const pathname = usePathname();
  const { zones, handlesLeads } = useInboundLeadsZones();
  const { count, oldestCreatedAtMs } = useInboundLeads(zones);
  const now = useNow();

  if (!handlesLeads || count === 0) return null;

  const open = () => {
    // The list reads its filters from the URL only when it opens, so when it is already open it is
    // told directly.
    if (pathname === "/quotes-bookings") {
      window.dispatchEvent(new Event(SHOW_INBOUND_LEADS_EVENT));
    } else {
      router.push(inboundLeadsHref(zones));
    }
  };

  return (
    <button
      type="button"
      onClick={open}
      title="Open the Inbound Leads list"
      className="mr-3 rounded-sm bg-red-600 px-3 py-1 text-left text-white leading-tight transition-colors hover:bg-red-700 cursor-pointer"
    >
      <span className="block text-sm font-bold">
        {count} New {count === 1 ? "Lead" : "Leads"}!
      </span>
      {oldestCreatedAtMs !== null && (
        <span className="block text-xs tabular-nums text-white/90">
          Wait: {formatWait(now - oldestCreatedAtMs)}
        </span>
      )}
    </button>
  );
}
