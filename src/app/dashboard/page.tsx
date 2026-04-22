"use client";
import LoadingSpinner from "@/components/LoadingSpinner";
import { FetchDashboardBleachers } from "@/features/dashboard/db/client/bleachers";
import { FetchDashboardEvents } from "@/features/dashboard/db/client/events";
import { useAuth } from "@clerk/nextjs";
import { useQuery } from "@tanstack/react-query";
import DashboardApp from "@/features/dashboard/DashboardApp";
import CellEditor from "@/features/dashboard/components/CellEditor";
import { useEffect, useState } from "react";
import { useWorkTrackerSelectionStore } from "@/features/workTrackers/state/useWorkTrackerSelectionStore";
import { Tables } from "../../../database.types";
import { useDataRefreshTokenStore } from "@/state/dataRefreshTokenStore";
// import { getSupabaseClient } from "@/utils/supabase/getSupabaseClient";
import { useDashboardFilterSettings } from "@/features/dashboardOptions/useDashboardFilterSettings";
import WorkTrackerModal from "@/features/workTrackers/components/WorkTrackerModal";
import { DashboardOptions } from "@/features/dashboardOptions/DashboardOptions";
import { SeasonToggle } from "@/features/dashboardOptions/SeasonToggle";
import { CreateEventButton } from "@/features/eventConfiguration/components/CreateEventButton";
import { EventConfiguration } from "@/features/eventConfiguration/components/EventConfiguration";
import { MaintenanceEventPanel } from "@/features/maintenanceEvents/components/MaintenanceEventPanel";
import BleacherLocationModal from "@/features/dashboard/components/BleacherLocationModal";
import SwapConfirmationModal from "@/features/dashboard/components/SwapConfirmationModal";
import { useBleacherLocationModalStore } from "@/features/dashboard/state/useBleacherLocationModalStore";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import { supabaseClientRegistry } from "@/features/dashboard/util/supabaseClientRegistry";
import { AddressTooltip } from "@/features/dashboard/components/AddressTooltip";
import { useDriverUnavailability } from "@/features/dashboard/db/hooks/useDriverUnavailability";
import { useDriverUnavailabilityStore } from "@/features/dashboard/state/useDriverUnavailabilityStore";

export default function Page() {
  const [selectedWorkTracker, setSelectedWorkTracker] = useState<Tables<"WorkTrackers"> | null>(
    null,
  );
  const { state: dashboardFilters } = useDashboardFilterSettings();
  const onlyShowMyEvents = dashboardFilters?.onlyShowMyEvents ?? true;
  const refreshToken = useDataRefreshTokenStore((s) => s.token);
  const { isLoaded, userId } = useAuth();
  const supabase = useClerkSupabaseClient();

  // Register supabase client for PixiJS components
  useEffect(() => {
    supabaseClientRegistry.setClient(supabase);
    return () => {
      supabaseClientRegistry.setClient(null);
    };
  }, [supabase]);

  // Bleacher location modal state
  const locationModal = useBleacherLocationModalStore();

  const { data, isLoading, error } = useQuery({
    queryKey: ["FetchDashboardBleachersAndEvents", { onlyShowMyEvents, userId, refreshToken }],
    enabled: isLoaded && !!userId,
    queryFn: async () => {
      const [b, e] = await Promise.all([
        FetchDashboardBleachers(supabase),
        FetchDashboardEvents(supabase, { onlyMine: onlyShowMyEvents, clerkUserId: userId }),
      ]);

      // Fetch BleacherUsers assignments for the logged-in user
      // const supabase = await getSupabaseClient(token!);

      return {
        bleachers: b.bleachers,
        events: e.events,
      };
    },
  });

  const handleWorkTrackerOpen = (workTracker: Tables<"WorkTrackers">) => {
    setSelectedWorkTracker(workTracker);
  };

  // Subscribe to selection store without changing DashboardApp props
  // Important: keep hooks above any early returns to preserve hook order across renders
  useEffect(() => {
    const unsub = useWorkTrackerSelectionStore.subscribe((s) => {
      const wt = s.selected;
      if (!wt) return;
      setSelectedWorkTracker({
        id: wt.id,
        bleacher_uuid: wt.bleacher_uuid,
        date: wt.date,
        created_at: "",
        dropoff_address_uuid: null,
        dropoff_poc: null,
        dropoff_time: null,
        notes: null,
        pay_cents: null,
        pickup_address_uuid: null,
        pickup_poc: null,
        pickup_time: null,
        // user_id: null,
        driver_uuid: null,
      } as Tables<"WorkTrackers">);
    });
    return () => unsub();
  }, []);

  // Sync driver unavailability data into the store for PixiJS access
  const unavailKeys = useDriverUnavailability();
  useEffect(() => {
    useDriverUnavailabilityStore.getState().setUnavailableKeys(unavailKeys);
  }, [unavailKeys]);

  if (error) {
    return <div>Uh Oh, Something went wrong... 😬</div>;
  }

  if (isLoading) {
    return (
      <div className="min-h-screen w-full flex items-center justify-center">
        <LoadingSpinner />
      </div>
    );
  }
  if (!data?.bleachers || data.bleachers.length === 0) {
    return <div>No Bleachers!</div>;
  }

  return (
    <div className="h-full grid grid-rows-[auto_1fr] gap-2 overflow-hidden min-w-0">
      <CellEditor onWorkTrackerOpen={handleWorkTrackerOpen} />
      <WorkTrackerModal
        selectedWorkTracker={selectedWorkTracker}
        setSelectedWorkTracker={setSelectedWorkTracker}
        setSelectedBlock={() => {}} // Not used in PixiJS version
      />
      {locationModal.isOpen && locationModal.bleacherNumber && locationModal.deviceId && (
        <BleacherLocationModal
          isOpen={locationModal.isOpen}
          onClose={locationModal.closeModal}
          bleacherNumber={locationModal.bleacherNumber}
          deviceId={locationModal.deviceId}
        />
      )}
      <SwapConfirmationModal />
      <div className="min-w-0">
        <div className="flex justify-between items-center pt-2 pl-2 pr-2">
          <div className="flex items-center gap-3">
            <DashboardOptions />
            <SeasonToggle />
          </div>
          <CreateEventButton />
        </div>
        <EventConfiguration showSetupTeardown={false} />
        <MaintenanceEventPanel />
      </div>
      <div className="min-h-0 min-w-0 overflow-hidden">
        <DashboardApp />
      </div>
      <AddressTooltip />
    </div>
  );
}
