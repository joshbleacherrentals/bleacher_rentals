"use client";

import { useEffect, useMemo } from "react";
import { useRouter } from "next/navigation";
import { PageHeaderWithBreadCrumbs } from "@/components/PageHeaderWithBreadCrumbs";
import { mergeRoleConfigs } from "@/features/userAccess/accessConfig";
import { useUserAccess } from "@/features/userAccess/client";
import { NEAR_LIMIT_RATIO, SYNC_BUCKET_LIMIT } from "../constants";
import { useSyncHealthRows } from "../hooks/useSyncHealthRows";
import { syncHealthGate } from "../logic/syncHealthGate";
import { SyncHealthTable } from "./SyncHealthTable";

/**
 * Sync Health — how many PowerSync buckets each driver's phone holds.
 *
 * The number comes from the app itself: after a successful sync it counts its
 * own buckets and writes them onto its Drivers row (br_driver
 * features/sync-health). A driver on an older build reports nothing, and shows
 * as "no report yet" rather than 0.
 *
 * The PAGE is developer-only — RLS lets developers read Drivers, the web sync
 * rules give them this page's own tables, and the gate below turns everyone
 * else away. The counts themselves are not secret: office roles already get
 * them on their Drivers rows.
 */
export default function SyncHealthPage() {
  const access = useUserAccess();
  const gate = syncHealthGate(access);
  const router = useRouter();

  const fallback = useMemo(
    () => (access.status === "active" ? mergeRoleConfigs(access.roles).defaultRedirect : "/"),
    [access],
  );

  useEffect(() => {
    if (gate === "redirect") router.replace(fallback);
  }, [gate, fallback, router]);

  if (gate !== "allowed") return null;
  return <SyncHealthContent />;
}

function SyncHealthContent() {
  const { rows, isLoading } = useSyncHealthRows();
  const now = new Date();

  const reported = rows.filter((row) => row.hasReport);
  const nearLimit = reported.filter((row) => row.isNearLimit).length;

  return (
    <div className="mx-auto max-w-5xl p-6">
      <PageHeaderWithBreadCrumbs
        crumbs={[{ label: "Sync Health" }]}
        description={`How many PowerSync buckets each driver's phone holds. The limit is ${SYNC_BUCKET_LIMIT}; a driver is highlighted from ${Math.round(
          NEAR_LIMIT_RATIO * 100,
        )}% of it.`}
      />

      <div className="bg-white border border-gray-200 rounded-xl overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 border-b border-gray-100">
          <div className="text-sm font-bold text-darkBlue">Drivers</div>
          <div className="text-xs text-gray-500">
            {reported.length} of {rows.length} reporting
            {nearLimit > 0 && ` · ${nearLimit} near the limit`}
          </div>
        </div>

        {isLoading ? (
          <div className="p-6 text-gray-500">Loading…</div>
        ) : (
          <SyncHealthTable rows={rows} now={now} />
        )}
      </div>

      <p className="text-xs text-gray-500 mt-3">
        Drivers on a build older than 1.10.4 do not report yet, so they show as “no report yet”.
      </p>
    </div>
  );
}
