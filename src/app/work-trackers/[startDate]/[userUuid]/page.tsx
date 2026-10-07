"use client";

import { TripList } from "../../../../features/workTrackers/components/TripList";
import WorkTrackerModal from "../../../../features/workTrackers/components/WorkTrackerModal";
import { useParams } from "next/navigation";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { useState } from "react";
import { Tables } from "../../../../../database.types";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { WORKTRACKER_STATUS_COLORS } from "@/features/workTrackers/constants";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { releaseAllDraftWorkTrackers } from "@/features/workTrackers/db/releaseAllDraftWorkTrackers";
import {
  fetchWorkTrackersForUserUuidAndStartDate,
  fetchDriverHeaderInfo,
  fetchDriverWithMetaForWeek,
} from "@/features/workTrackers/db/db";
import { PaymentStatusButton } from "@/features/workTrackers/components/PaymentStatusButton";
import { TotalsMatch } from "@/features/workTrackers/components/TotalsMatch";
import { MarkPaidButton } from "@/features/workTrackers/components/MarkPaidButton";
import { DRIVER_WITH_META_QUERY_KEY } from "@/features/workTrackers/util/invalidateGroupQueries";
import { useWorkTrackerGroupPaid } from "@/features/workTrackers/hooks/useWorkTrackerGroupPaid";
import { DateTime } from "luxon";
import { buildReleaseAllNotification } from "@/features/workTrackers/db/notifications";
import { getDateRange } from "@/features/workTrackers/util";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useUserAccess } from "@/features/userAccess/client";
import {
  canMarkGroupPaid,
  canReleaseAllDrafts,
} from "@/features/workTrackers/util/workTrackerPageAccess";

const getRandomLoadingMessage = () => {
  const messages = [
    "Hmm...",
    "Hold on...",
    "Just a sec...",
    "Working on it...",
    "Beep boop...",
    "Loading magic...",
    "Hold your horses...",
    "Here we go again...",
    "Generating PDF (reluctantly)...",
    "On it boss!",
  ];
  return messages[Math.floor(Math.random() * messages.length)];
};

export default function WorkTrackersForUserPage() {
  const params = useParams();
  const supabase = useClerkSupabaseClient();
  const startDate = params.startDate as string;
  const userUuid = params.userUuid as string;
  const className = "py-2 text-center text-xs font-semibold border-r";
  const [selectedWorkTracker, setSelectedWorkTracker] = useState<Tables<"WorkTrackers"> | null>(
    null,
  );
  const [isLoading, setIsLoading] = useState(false);
  const [showReleaseModal, setShowReleaseModal] = useState(false);
  const [isReleasing, setIsReleasing] = useState(false);
  const queryClient = useQueryClient();

  const { data: driverHeaderInfo } = useQuery({
    queryKey: ["driver-header-info", userUuid],
    enabled: !!supabase && !!userUuid,
    queryFn: () => fetchDriverHeaderInfo(supabase, userUuid),
  });

  const weekEnd = DateTime.fromISO(startDate).plus({ days: 6 }).toISODate() ?? startDate;

  const { data: driverMeta } = useQuery({
    queryKey: [DRIVER_WITH_META_QUERY_KEY, userUuid, startDate],
    enabled: !!supabase && !!userUuid && !!startDate,
    queryFn: () => fetchDriverWithMetaForWeek(supabase, userUuid, startDate),
  });

  const { groupId: paidGroupId, isPaid } = useWorkTrackerGroupPaid(
    driverMeta?.driver_uuid ?? null,
    startDate,
  );
  const access = useUserAccess();
  const roles = access.status === "active" ? access.roles : [];
  const canMarkPaid = canMarkGroupPaid({
    isAdmin: roles.includes("admin"),
    isAccountant: roles.includes("accountant"),
  });

  const dateRange = getDateRange(startDate);
  const perms = usePermissionsStore();
  const canReleaseAll = canReleaseAllDrafts({
    isAdmin: perms.isAdmin,
    leadZoneIds: perms.leadZoneIds,
  });

  const { data: draftTripCount = 0 } = useQuery({
    queryKey: ["draft-work-trackers-count", userUuid, startDate],
    enabled: showReleaseModal && !!supabase,
    queryFn: async () => {
      const result = await fetchWorkTrackersForUserUuidAndStartDate(
        supabase,
        userUuid,
        startDate,
        false,
      );
      return result.workTrackers.filter((row) => row.workTracker.status === "draft").length;
    },
    refetchOnWindowFocus: false,
  });

  const releasePreview = buildReleaseAllNotification(draftTripCount, startDate);

  const handleReleaseAll = async () => {
    if (!supabase) return;
    setIsReleasing(true);
    try {
      const count = await releaseAllDraftWorkTrackers(supabase, userUuid, startDate);
      setShowReleaseModal(false);
      if (count === 0) {
        createErrorToast(["No draft work trackers to release."]);
      } else {
        createSuccessToast([`Released ${count} trip${count > 1 ? "s" : ""}`]);
        queryClient.invalidateQueries({ queryKey: ["work-trackers", userUuid, startDate] });
      }
    } catch (err: any) {
      setShowReleaseModal(false);
      createErrorToast(["Failed to release work trackers", err?.message ?? ""]);
    } finally {
      setIsReleasing(false);
    }
  };

  const handleDownload = async () => {
    setIsLoading(true);
    if (!supabase) {
      alert("You must be signed in to download.");
      setIsLoading(false);
      return;
    }

    const res = await fetch(`/work-trackers/${startDate}/${userUuid}/pdf`, {
      method: "GET",
      // headers: {
      //   Authorization: `Bearer ${token}`,
      // },
    });

    if (!res.ok) {
      setIsLoading(false);
      createErrorToast(["We Got a Problem, Boss...", "Failed to download PDF", res.statusText]);
    } else {
      setIsLoading(false);
      createSuccessToast(["PDF Downloaded"]);
    }
    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);

    // Create a temporary link to trigger download
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", `work-trackers-${userUuid}-${startDate}.pdf`);
    document.body.appendChild(link);
    link.click();

    // Clean up
    link.remove();
    window.URL.revokeObjectURL(url);
  };

  return (
    <div>
      <div className="flex items-center gap-2">
        {/* Same Button, size and corner radius as the status and paid buttons beside them. */}
        <Button
          size="sm"
          onClick={handleDownload}
          disabled={isLoading}
          className="bg-darkBlue text-white hover:bg-lightBlue cursor-pointer"
        >
          {isLoading ? getRandomLoadingMessage() : "Download PDF"}
        </Button>
        {canReleaseAll && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setShowReleaseModal(true)}
            className={`${WORKTRACKER_STATUS_COLORS.released.bg} ${WORKTRACKER_STATUS_COLORS.released.border} ${WORKTRACKER_STATUS_COLORS.released.text} hover:bg-blue-500/10 hover:text-blue-700 hover:opacity-80 cursor-pointer`}
          >
            Release All
            <Send />
          </Button>
        )}
        {driverMeta && (
          <div className="flex items-center gap-2">
            <PaymentStatusButton driver={driverMeta} weekStart={startDate} weekEnd={weekEnd} />
            <TotalsMatch driver={driverMeta} />
            <MarkPaidButton
              groupId={paidGroupId}
              driverName={`${driverMeta.first_name} ${driverMeta.last_name}`}
              isPaid={isPaid}
              canMarkPaid={canMarkPaid}
            />
          </div>
        )}
      </div>

      {/* Document-style header — mirrors the PDF layout */}
      <div className="border border-gray-200 mt-4">
        <div className="bg-darkBlue px-2 py-1">
          <span className="text-white font-bold text-xs">
            {`${dateRange} - ${driverHeaderInfo?.driverName ?? ""}`}
          </span>
        </div>
        <p className="text-xs font-bold italic underline px-2 pt-1">Bleacher Deliveries/Pickups</p>
        {driverHeaderInfo && (
          <div className="px-2 pb-2 pt-1 flex flex-wrap gap-x-6 gap-y-1 text-xs">
            {driverHeaderInfo.vendor && (
              <span>
                <span className="font-semibold">Vendor:</span>{" "}
                {driverHeaderInfo.vendor.display_name}
              </span>
            )}
            {driverHeaderInfo.address && (
              <span>
                <span className="font-semibold">Address:</span>{" "}
                {[
                  driverHeaderInfo.address.street,
                  driverHeaderInfo.address.city,
                  driverHeaderInfo.address.state_province,
                  driverHeaderInfo.address.zip_postal,
                ]
                  .filter(Boolean)
                  .join(", ")}
              </span>
            )}
            {driverHeaderInfo.vendor?.ein && (
              <span>
                <span className="font-semibold">EIN:</span>{" "}
                {`${driverHeaderInfo.vendor.ein.slice(0, 2)}-${driverHeaderInfo.vendor.ein.slice(2)}`}
              </span>
            )}
            {driverHeaderInfo.vendor?.hst && (
              <span>
                <span className="font-semibold">HST:</span> {driverHeaderInfo.vendor.hst}
              </span>
            )}
            {driverHeaderInfo.driverPhone && (
              <span>
                <span className="font-semibold">Phone:</span> {driverHeaderInfo.driverPhone}
              </span>
            )}
            {driverHeaderInfo.driverEmail && (
              <span>
                <span className="font-semibold">Email:</span> {driverHeaderInfo.driverEmail}
              </span>
            )}
          </div>
        )}
      </div>

      <table className="min-w-full border-collapse border-x border-b border-gray-200 mt-0">
        {/* Header */}
        <thead className="bg-gray-100">
          <tr>
            <th className={`w-0 whitespace-nowrap ${className}`}>Status</th>
            <th className={`w-[7%] ${className}`}>Date</th>
            <th className={`w-[6%] ${className}`}>Bleacher</th>
            <th className={`w-[7%] ${className}`}>Activity Type</th>
            <th className={`w-[10%] ${className}`}>Pickup Location</th>
            <th className={`w-[7%] ${className}`}>POC at P/U</th>
            <th className={`w-[6%] ${className}`}>Time</th>
            <th className={`w-[10%] ${className}`}>Dropoff Location</th>
            <th className={`w-[7%] ${className}`}>POC at D/O</th>
            <th className={`w-[6%] ${className}`}>Time</th>
            <th className={`w-[6%] ${className}`}>Drive Time</th>
            <th className={`w-[7%] ${className}`}>Milage</th>
            <th className={`w-[7%] ${className}`}>Pay</th>
            <th className={`w-[14%] ${className}`}>Notes</th>
          </tr>
        </thead>
        <TripList
          userUuid={userUuid}
          startDate={startDate}
          onSelectWorkTracker={(wt) => setSelectedWorkTracker(wt)}
        />
      </table>

      <Dialog open={showReleaseModal} onOpenChange={setShowReleaseModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Release All Trips</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Are you sure you want to release these trips to the Driver? All work trackers currently
            marked as <span className="font-semibold text-yellow-700">Draft</span> will be set to{" "}
            <span className="font-semibold text-blue-700">Released</span>.
          </p>
          <p className="text-xs text-gray-400 mt-1">
            Work trackers that are already released or in a later status will not be affected.
          </p>
          <div className="mt-3 rounded border border-blue-200 bg-blue-50 p-3">
            <p className="text-xs font-semibold text-blue-800">Driver notification preview</p>
            <p className="mt-1 text-sm font-semibold text-blue-900">{releasePreview.title}</p>
            <p className="text-sm text-blue-900">{releasePreview.body}</p>
          </div>
          <DialogFooter className="gap-2 mt-4">
            <button
              onClick={() => setShowReleaseModal(false)}
              disabled={isReleasing}
              className="px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition cursor-pointer disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              onClick={handleReleaseAll}
              disabled={isReleasing}
              className={`px-4 py-2 text-sm font-semibold rounded text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed`}
            >
              {isReleasing ? "Releasing..." : "Yes, Release All"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Modal lives outside the table for proper semantics */}
      <WorkTrackerModal
        selectedWorkTracker={selectedWorkTracker}
        setSelectedWorkTracker={setSelectedWorkTracker}
        setSelectedBlock={() => {}}
      />
    </div>
  );
}
