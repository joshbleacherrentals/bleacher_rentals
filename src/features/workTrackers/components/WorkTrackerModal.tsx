import { Link, X, Trash2, Calculator, Pencil } from "lucide-react";
import { Dropdown } from "@/components/DropDown";
import { useEffect, useState, useRef } from "react";
import { EditWorkTrackerTypesModal } from "./EditWorkTrackerTypesModal";
import AddressAutocomplete from "@/components/AddressAutoComplete";
import {
  getAddressFromUuid,
  saveWorkTracker,
  deleteWorkTracker,
} from "../../dashboard/db/client/db";
import { AddressData } from "../../eventConfiguration/state/useCurrentEventStore";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Tables } from "../../../../database.types";
import { fetchBleachersForOptions, fetchDriverPaymentData } from "@/app/team/_lib/db";
import { toLatLngString, calculateDriverPay } from "../util";
import RouteMapPreview from "./RouteMapPreview";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import WorkTrackerStatusBadge from "./WorkTrackerStatusBadge";
import { EditBlock } from "@/features/dashboard/types";
import { fetchWorkTrackerByUuid } from "@/features/dashboard/db/client/fetchWorkTracker";
import { SelectDriver } from "./SelectDriver";
import { useDrivers } from "../hooks/useDrivers.db";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildTripStatusNotification } from "@/features/workTrackers/db/notifications";
import BillOfLadingButton from "./billOfLading/BillOfLadingButton";
import { useDriverAssignment } from "./driverAssignment/hooks/useDriverAssignment";
import { DriverSuggestion, SuggestDriverButton } from "./driverAssignment/driverSuggestion";
import { TripAssignment } from "./driverAssignment/lib/types/DriverAssignment";
import { useUsersStore } from "@/state/userStore";
import { useUser } from "@clerk/nextjs";

type WorkTrackerModalProps = {
  selectedWorkTracker: Tables<"WorkTrackers"> | null;
  setSelectedWorkTracker: (block: Tables<"WorkTrackers"> | null) => void;
  setSelectedBlock: (block: EditBlock | null) => void;
};

export default function WorkTrackerModal({
  selectedWorkTracker,
  setSelectedWorkTracker,
  setSelectedBlock,
}: WorkTrackerModalProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();

  // Fetch drivers with user data using PowerSync
  const { data: drivers = [] } = useDrivers();

  const [workTracker, setWorkTracker] = useState<Tables<"WorkTrackers"> | null>(
    selectedWorkTracker,
  );
  const pickupAddress = getAddressFromUuid(selectedWorkTracker?.pickup_address_uuid ?? null);
  const dropoffAddress = getAddressFromUuid(selectedWorkTracker?.dropoff_address_uuid ?? null);
  const [pickUpAddress, setPickUpAddress] = useState<AddressData | null>(pickupAddress);
  const [dropOffAddress, setDropOffAddress] = useState<AddressData | null>(dropoffAddress);

  const [payInput, setPayInput] = useState(
    selectedWorkTracker?.pay_cents != null ? (selectedWorkTracker?.pay_cents / 100).toFixed(2) : "",
  );
  const [initialStatus, setInitialStatus] = useState<Tables<"WorkTrackers">["status"]>(
    selectedWorkTracker?.status ?? "draft",
  );
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [showEditTypes, setShowEditTypes] = useState(false);

  const { suggest, isLoading: isSuggesting, error: suggestError } = useDriverAssignment();
  const [suggestion, setSuggestion] = useState<TripAssignment | null>(null);

  // Fetch available work tracker types
  const { data: workTrackerTypes = [] } = useQuery({
    queryKey: ["work-tracker-types"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("WorkTrackerTypes")
        .select("*")
        .order("sort_order", { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  // --- Resolve current user's account manager UUID ---
// useUser() gives us the Clerk session. We map clerk_user_id → internal Users.id
// → AccountManagers.id in one query, done lazily only when "Suggest" is clicked.
const { user: clerkUser } = useUser();
const users = useUsersStore((s) => s.users);
 
const getCurrentAccountManagerUuid = async (): Promise<string | null> => {
  // 1. Map Clerk ID → internal user UUID via the users store
  const internalUser = users.find((u) => u.clerk_user_id === clerkUser?.id);
  if (!internalUser) return null;
 
  // 2. Look up AccountManagers row for this user
  const { data, error } = await supabase
    .from("AccountManagers")
    .select("id")
    .eq("user_uuid", internalUser.id)
    .eq("is_active", true)
    .single();
 
  if (error || !data) return null;
  return data.id;
};

  // Helper to format address for Distance Matrix API
  const formatAddressString = (addr: AddressData | null): string => {
    if (!addr) return "";
    // If the address already contains city/state (common for our stored addresses),
    // just use the address field
    if (
      addr.address &&
      addr.city &&
      (addr.address.includes(addr.city) || addr.address.includes(","))
    ) {
      return addr.address;
    }
    // Otherwise, build the full address
    const parts = [addr.address, addr.city, addr.state, addr.postalCode].filter(Boolean);
    return parts.join(", ");
  };

  // Try lat/lng first, fallback to address string
  const origin = toLatLngString(pickUpAddress ?? undefined) || formatAddressString(pickUpAddress);
  const dest = toLatLngString(dropOffAddress ?? undefined) || formatAddressString(dropOffAddress);

  const distanceQueryEnabled = Boolean(origin && dest);

  const handleSuggestDriver = async () => {
  if (!workTracker?.id) return;
 
  // Require both addresses so the optimizer can calculate distances
  if (!workTracker.pickup_address_uuid || !workTracker.dropoff_address_uuid) {
    createErrorToast(["Set pickup and dropoff addresses before suggesting a driver."]);
    return;
  }
 
  // New (unsaved) work trackers don't have a DB row yet — addresses aren't
  // persisted so the optimizer can't look them up. Prompt the user to save first.
  if (workTracker.id === "-1") {
    createErrorToast(["Save the work tracker first, then use Suggest to find the best driver."]);
    return;
  }
 
  // Derive account manager UUID from the logged-in user at click time
  const accountManagerUuid = await getCurrentAccountManagerUuid();
  if (!accountManagerUuid) {
    createErrorToast(["Could not determine your account manager profile. Are you set up as an account manager?"]);
    return;
  }
 
  const result = await suggest({
    workTrackerIds: [workTracker.id],
    accountManagerUuid,
  });
 
  if (result && result.assignments.length > 0) {
    setSuggestion(result.assignments[0]);
  } else {
    createErrorToast(["No eligible drivers found for this trip."]);
  }
};

  // Debug logging
  console.log("Distance Query Debug:", {
    origin,
    dest,
    pickUpPlaceId: pickUpAddress?.placeId,
    dropOffPlaceId: dropOffAddress?.placeId,
    distanceQueryEnabled,
    pickUpAddress,
    dropOffAddress,
  });

  const {
    data: leg,
    isFetching: isLegFetching,
    error: legErr,
  } = useQuery({
    queryKey: ["gmaps-distance", origin, dest],
    enabled: distanceQueryEnabled,
    refetchOnWindowFocus: false,
    queryFn: async () => {
      const res = await fetch(
        `/api/distance?origin=${encodeURIComponent(origin)}&dest=${encodeURIComponent(dest)}`,
      );
      if (!res.ok) throw new Error(`Distance API failed (${res.status})`);
      return res.json() as Promise<{
        distanceMeters: number | null;
        distanceText: string | null;
        durationSeconds: number | null;
        durationText: string | null;
        durationInTrafficSeconds?: number | null;
        durationInTrafficText?: string | null;
      }>;
    },
  });

  useEffect(() => {
    setWorkTracker(selectedWorkTracker);
    setInitialStatus(selectedWorkTracker?.status ?? "draft");
    setPayInput(
      selectedWorkTracker?.pay_cents != null
        ? (selectedWorkTracker?.pay_cents / 100).toFixed(2)
        : "",
    );
  }, [selectedWorkTracker]);

  // useEffect(() => {
  //   if (workTracker?.pay_cents != null) {
  //     setPayInput((workTracker.pay_cents / 100).toFixed(2));
  //   }
  // }, [workTracker?.pay_cents]);

  // console.log("selectedWorkTracker WorkTrackerModal", selectedWorkTracker);

  // Bleacher options for the dropdown
  const {
    data: bleacherOptions,
    isLoading: isBleachersLoading,
    isError: isBleachersError,
  } = useQuery({
    queryKey: ["bleacherOptions"],
    queryFn: async () => {
      return fetchBleachersForOptions(supabase);
    },
  });

  // Fetch driver payment data when driver is selected
  const selectedDriver = drivers?.find((d) => d.driver_uuid === workTracker?.driver_uuid);
  const {
    data: driverPaymentData,
    isLoading: isDriverPaymentLoading,
    isError: isDriverPaymentError,
  } = useQuery({
    queryKey: ["driverPayment", workTracker?.driver_uuid],
    queryFn: async () => {
      return fetchDriverPaymentData(selectedDriver!.user_uuid, supabase);
    },
    enabled: !!workTracker?.driver_uuid && !!selectedDriver,
  });

  const {
    data: fetchedWorkTracker,
    isLoading: isWorkTrackerLoading,
    isError: isWorkTrackerError,
  } = useQuery({
    queryKey: ["workTracker", selectedWorkTracker?.id],
    queryFn: async () => {
      return fetchWorkTrackerByUuid(selectedWorkTracker!.id, supabase);
    },
    enabled: !!selectedWorkTracker && selectedWorkTracker.id !== "-1",
    refetchOnWindowFocus: false,
  });

  // Once types load, set default type for new work trackers that don't yet have one
  useEffect(() => {
    if (
      workTracker?.id === "-1" &&
      !workTracker?.work_tracker_type_uuid &&
      workTrackerTypes.length > 0
    ) {
      const tripType =
        workTrackerTypes.find((t) => t.display_name === "Trip") ?? workTrackerTypes[0];
      setWorkTracker((prev) => (prev ? { ...prev, work_tracker_type_uuid: tripType.id } : prev));
    }
  }, [workTrackerTypes, workTracker?.id, workTracker?.work_tracker_type_uuid]);

  useEffect(() => {
    if (selectedWorkTracker?.id === "-1") {
      setWorkTracker(selectedWorkTracker);
      setInitialStatus("draft");
      setPickUpAddress(null);
      setDropOffAddress(null);
      // Default to "Trip" type for new work trackers
      const tripType = workTrackerTypes.find((t) => t.display_name === "Trip");
      if (tripType) {
        setWorkTracker((prev) => ({ ...prev!, work_tracker_type_uuid: tripType.id }));
      }
    } else if (fetchedWorkTracker) {
      console.log("fetchedWorkTracker", fetchedWorkTracker);
      setWorkTracker(fetchedWorkTracker.workTracker);
      setInitialStatus(fetchedWorkTracker.workTracker?.status ?? "draft");
      setPayInput(
        fetchedWorkTracker.workTracker && fetchedWorkTracker.workTracker.pay_cents != null
          ? (fetchedWorkTracker.workTracker.pay_cents / 100).toFixed(2)
          : "",
      );
      setPickUpAddress({
        addressUuid: fetchedWorkTracker.pickupAddress?.id ?? null,
        address: fetchedWorkTracker.pickupAddress?.street ?? "",
        city: fetchedWorkTracker.pickupAddress?.city ?? "",
        state: fetchedWorkTracker.pickupAddress?.state_province ?? "",
        postalCode: fetchedWorkTracker.pickupAddress?.zip_postal ?? "",
      });
      setDropOffAddress({
        addressUuid: fetchedWorkTracker.dropoffAddress?.id ?? null,
        address: fetchedWorkTracker.dropoffAddress?.street ?? "",
        city: fetchedWorkTracker.dropoffAddress?.city ?? "",
        state: fetchedWorkTracker.dropoffAddress?.state_province ?? "",
        postalCode: fetchedWorkTracker.dropoffAddress?.zip_postal ?? "",
      });
    }
  }, [selectedWorkTracker, fetchedWorkTracker]);

  const handleSaveWorkTracker = async () => {
    try {
      // Merge distance/duration from the Google Maps leg into the tracker before saving
      const trackerToSave = workTracker
        ? {
            ...workTracker,
            distance_meters:
              leg?.distanceMeters != null
                ? Math.round(leg.distanceMeters)
                : workTracker.distance_meters,
            drive_minutes:
              leg?.durationInTrafficSeconds != null || leg?.durationSeconds != null
                ? Math.round((leg.durationInTrafficSeconds ?? leg.durationSeconds!) / 60)
                : workTracker.drive_minutes,
          }
        : workTracker;
      await saveWorkTracker(trackerToSave, pickUpAddress, dropOffAddress, supabase, {
        previousStatus: initialStatus,
        driverUserUuid: selectedDriver?.user_uuid ?? null,
        previousPickupAddress: pickupAddress?.address ?? "an unknown pickup location",
        previousPickupCity: pickupAddress?.city ?? "",
        previousDropoffAddress: dropoffAddress?.address ?? "an unknown dropoff location",
        previousDropoffCity: dropoffAddress?.city ?? "",
      });
      setShowSaveConfirmModal(false);
      // Refresh bleachers directly into the zustand store so Pixi updates without remounting
      try {
        const { FetchDashboardBleachers } =
          await import("@/features/dashboard/db/client/bleachers");
        await FetchDashboardBleachers(supabase);
      } catch {}
      // Invalidate this specific work tracker's cache so re-opening shows fresh data
      await queryClient.invalidateQueries({ queryKey: ["workTracker", workTracker?.id] });
      // Optionally refresh any active work-tracker-specific queries used elsewhere
      await queryClient.invalidateQueries({ queryKey: ["work-trackers"], refetchType: "active" });
      setSelectedWorkTracker(null);
      setSelectedBlock(null);
    } catch (error) {
      createErrorToast(["Failed to Save Work Tracker:", String(error)]);
    }
  };

  const handleDeleteWorkTracker = async () => {
    if (!workTracker?.id || workTracker.id === "-1") {
      createErrorToast(["Cannot delete unsaved work tracker"]);
      return;
    }

    if (!confirm("Are you sure you want to delete this work tracker?")) {
      return;
    }

    try {
      await deleteWorkTracker(workTracker.id, supabase, {
        driverUserUuid: selectedDriver?.user_uuid ?? null,
        driverUuid: workTracker.driver_uuid,
        pickupAddress:
          pickUpAddress?.address ?? pickupAddress?.address ?? "an unknown pickup location",
        pickupCity: pickUpAddress?.city ?? pickupAddress?.city ?? "",
        dropoffAddress:
          dropOffAddress?.address ?? dropoffAddress?.address ?? "an unknown dropoff location",
        dropoffCity: dropOffAddress?.city ?? dropoffAddress?.city ?? "",
        date: workTracker.date,
      });
      // Refresh bleachers directly into the zustand store so Pixi updates without remounting
      try {
        const { FetchDashboardBleachers } =
          await import("@/features/dashboard/db/client/bleachers");
        await FetchDashboardBleachers(supabase);
      } catch {}
      // Optionally refresh any active work-tracker-specific queries used elsewhere
      await queryClient.invalidateQueries({ queryKey: ["work-trackers"], refetchType: "active" });
      setSelectedWorkTracker(null);
      setSelectedBlock(null);
    } catch (error) {
      createErrorToast(["Failed to Delete Work Tracker:", String(error)]);
    }
  };

  function handlePayChange(e: React.ChangeEvent<HTMLInputElement>) {
    const raw = e.target.value;

    // Allow empty input for backspacing
    if (raw === "") {
      setPayInput("");
      setWorkTracker((prev) => ({ ...prev!, pay_cents: null }));
      return;
    }

    // Only allow numbers with max 2 decimals
    const validFormat = /^\d*\.?\d{0,2}$/;
    if (!validFormat.test(raw)) return;

    setPayInput(raw);

    const parsed = parseFloat(raw);
    if (!isNaN(parsed)) {
      setWorkTracker((prev) => ({
        ...prev!,
        pay_cents: Math.round(parsed * 100),
      }));
    }
  }

  const handleCalculatePay = () => {
    if (!driverPaymentData) {
      createErrorToast(["Cannot calculate pay: Driver payment data not loaded"]);
      return;
    }

    if (!leg) {
      createErrorToast(["Cannot calculate pay: Distance/duration data not available"]);
      return;
    }

    const amount = calculateDriverPay(driverPaymentData, leg);

    if (amount === null || amount === 0) {
      createErrorToast(["Cannot calculate pay: Missing distance or duration data"]);
      return;
    }

    // Update the pay input field
    const formattedAmount = amount.toFixed(2);
    setPayInput(formattedAmount);
    setWorkTracker((prev) => ({
      ...prev!,
      pay_cents: Math.round(amount * 100),
    }));
  };

  const labelClassName = "block text-sm font-medium text-gray-700 mt-1";
  const inputClassName = "w-full p-2 border rounded bg-white";

  const saveNotificationPreview = buildTripStatusNotification({
    previousStatus: workTracker?.id === "-1" ? "draft" : initialStatus,
    nextStatus: workTracker?.status ?? "draft",
    pickupAddress: pickUpAddress?.address ?? pickupAddress?.address ?? "an unknown pickup location",
    pickupCity: pickUpAddress?.city ?? pickupAddress?.city ?? "",
    dropoffAddress:
      dropOffAddress?.address ?? dropoffAddress?.address ?? "an unknown dropoff location",
    dropoffCity: dropOffAddress?.city ?? dropoffAddress?.city ?? "",
    date: workTracker?.date ?? null,
  });

  // Track whether the initial mousedown began on the backdrop so we only close when both down & up occur there
  const mouseDownOnBackdrop = useRef(false);

  const handleBackdropMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    mouseDownOnBackdrop.current = e.target === e.currentTarget; // only true if directly on backdrop
  };

  const handleBackdropMouseUp = (e: React.MouseEvent<HTMLDivElement>) => {
    if (mouseDownOnBackdrop.current && e.target === e.currentTarget) {
      setSelectedWorkTracker(null);
    }
    mouseDownOnBackdrop.current = false;
  };

  if (isWorkTrackerLoading)
    return (
      <div
        onMouseDown={() => setSelectedWorkTracker(null)}
        className="fixed inset-0 z-[2000] bg-black/0 backdrop-blur-xs flex items-center justify-center"
      >
        <LoadingSpinner />
      </div>
    );
  return (
    <>
      {selectedWorkTracker !== null && (
        <div
          onMouseDown={handleBackdropMouseDown}
          onMouseUp={handleBackdropMouseUp}
          className="fixed inset-0 z-[2000] bg-black/30 backdrop-blur-xs flex items-center justify-center"
        >
          <div
            onMouseDown={(e) => e.stopPropagation()} // 👈 prevent bubbling here
            className=" p-4 rounded shadow w-[900px] transition-colors duration-200 bg-white"
          >
            <div className="flex flex-row justify-between items-start">
              <h2 className="text-sm font-semibold mb-2">
                {selectedWorkTracker.id === "-1" ? "Create Work Tracker" : "Edit Work Tracker"}
              </h2>
              <X
                className="-mt-1 cursor-pointer text-black/30 hover:text-black hover:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] transition-all duration-200"
                onClick={() => setSelectedWorkTracker(null)}
              />
            </div>
            <div className="flex flex-row gap-4">
              {/* Column 1: Global Info */}
                <label className={labelClassName}>Driver</label>
                <SuggestDriverButton
                    onClick={handleSuggestDriver}
                    isLoading={isSuggesting}
                    disabled={!workTracker?.pickup_address_uuid || !workTracker?.dropoff_address_uuid}
                  />
                </div>
                <SelectDriver
                  value={workTracker?.driver_uuid ?? null}
                  onChange={(id) => {
                    setWorkTracker((prev) => ({ ...prev!, driver_uuid: id }));
                    setSuggestion(null); // clear suggestion when manually changed
                  }}
                  placeholder="Select Driver"
                  date={workTracker?.date ?? null}
                />
                <DriverSuggestion
                  assignment={suggestion}
                  isLoading={isSuggesting}
                  error={suggestError}
                  onAccept={(driverUuid) => {
                    setWorkTracker((prev) => ({ ...prev!, driver_uuid: driverUuid }));
                    setSuggestion(null);
                  }}
                />    
                <div className="flex-1">
                <div className="flex flex-row gap-2">
                  <div className="flex-[2]">
                    <div className="flex items-center justify-between">

                  </div>
                  <div className="flex-1">
                    <label className={labelClassName}>Bleacher</label>
                    <Dropdown
                      options={(bleacherOptions ?? []).map((bleacher) => ({
                        label: bleacher.label,
                        value: bleacher.uuid,
                      }))}
                      selected={workTracker?.bleacher_uuid}
                      onSelect={(id) =>
                        setWorkTracker((prev) => ({
                          ...prev!,
                          bleacher_uuid: id,
                        }))
                      }
                      placeholder={isBleachersLoading ? "Loading..." : "Select Bleacher"}
                    />
                  </div>
                </div>

                {/* Work Tracker Type */}
                <div className="mt-1">
                  <div className="flex items-center justify-between">
                    <label className={labelClassName}>Type</label>
                    <button
                      type="button"
                      onClick={() => setShowEditTypes(true)}
                      className="flex items-center gap-1 text-xs text-gray-400 hover:text-gray-700 transition-colors mt-1"
                    >
                      <Pencil className="h-3 w-3" />
                      Edit types
                    </button>
                  </div>
                  <Dropdown
                    options={workTrackerTypes.map((t) => ({
                      label: t.display_name,
                      value: t.id,
                    }))}
                    selected={workTracker?.work_tracker_type_uuid ?? undefined}
                    onSelect={(id) =>
                      setWorkTracker((prev) => ({
                        ...prev!,
                        work_tracker_type_uuid: id,
                      }))
                    }
                    placeholder="Select Type"
                  />
                </div>

                <label className={labelClassName}>Project Number</label>
                <input
                  type="text"
                  className={inputClassName}
                  placeholder="Project Number"
                  value={workTracker?.project_number ?? ""}
                  onChange={(e) =>
                    setWorkTracker((prev) => ({
                      ...prev!,
                      project_number: e.target.value || null,
                    }))
                  }
                />

                <label className={labelClassName}>Date</label>
                <input
                  type="date"
                  className={inputClassName}
                  value={workTracker?.date ?? ""}
                  onChange={(e) =>
                    setWorkTracker((prev) => ({
                      ...prev!,
                      date: e.target.value,
                    }))
                  }
                />
                {/* Status Badge - Account Manager can toggle between draft and released */}
                <label className={labelClassName}>Status</label>
                <div className="flex items-center justify-center p-3 bg-gray-50 rounded border">
                  <WorkTrackerStatusBadge
                    status={workTracker?.status ?? "draft"}
                    onStatusChange={(newStatus) => {
                      setWorkTracker((prev) => ({
                        ...prev!,
                        status: newStatus,
                      }));
                    }}
                    canEdit={true}
                  />
                </div>
                <label className={labelClassName}>Driver Notes</label>
                <textarea
                  className="w-full text-sm border p-1 rounded bg-white"
                  value={workTracker?.notes ?? ""}
                  placeholder="Driver Notes"
                  onChange={(e) =>
                    setWorkTracker((prev) => ({
                      ...prev!,
                      notes: e.target.value,
                    }))
                  }
                  rows={4}
                />
                <label className={labelClassName}>Internal Notes</label>
                <textarea
                  className="w-full text-sm border p-1 rounded bg-white"
                  value={workTracker?.internal_notes ?? ""}
                  placeholder="Internal Notes"
                  onChange={(e) =>
                    setWorkTracker((prev) => ({
                      ...prev!,
                      internal_notes: e.target.value,
                    }))
                  }
                  rows={4}
                />
                <label className={labelClassName}>Pay</label>
                <div className="flex flex-row gap-2 items-center">
                  <input
                    type="number"
                    className={inputClassName}
                    step="0.01"
                    min="0"
                    value={payInput}
                    onChange={handlePayChange}
                    placeholder="0.00"
                  />
                  <Calculator
                    className="h-5 w-5 hover:h-6 hover:w-6 transition-all cursor-pointer text-darkBlue hover:text-lightBlue"
                    onClick={handleCalculatePay}
                  />
                </div>
              </div>

              {/* Columns 2 & 3: Pickup, Dropoff, and Map */}
              <div className="flex-[2] flex flex-col gap-4">
                <div className="flex flex-row gap-4">
                  {/* Column 2: Pickup */}
                  <div className="flex-1">
                    <label className={labelClassName}>Pickup Time</label>
                    <input
                      type="text"
                      className={inputClassName}
                      placeholder="Pickup Time"
                      value={workTracker?.pickup_time ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({ ...prev!, pickup_time: e.target.value }))
                      }
                    />
                    <label className={labelClassName}>Pickup POC</label>
                    <input
                      type="text"
                      className={inputClassName}
                      placeholder="Pickup POC"
                      value={workTracker?.pickup_poc ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({ ...prev!, pickup_poc: e.target.value }))
                      }
                    />
                    <label className={labelClassName}>Pickup Address</label>
                    <div className="flex flex-row gap-2 items-center">
                      <AddressAutocomplete
                        className="bg-white"
                        onAddressSelect={(data) =>
                          setPickUpAddress({
                            ...data,
                            addressUuid: pickUpAddress?.addressUuid ?? null,
                          })
                        }
                        initialValue={pickUpAddress?.address || ""}
                      />
                      <Link className="h-5 w-5 hover:h-6 hover:w-6 transition-all cursor-pointer" />
                    </div>
                    <label className={labelClassName}>Pickup Instructions</label>
                    <textarea
                      className="w-full text-sm border p-1 rounded bg-white"
                      placeholder="Pickup Instructions"
                      value={workTracker?.pickup_instructions ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({
                          ...prev!,
                          pickup_instructions: e.target.value || null,
                        }))
                      }
                      rows={3}
                    />
                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!workTracker?.teardown_required}
                        onChange={(e) =>
                          setWorkTracker((prev) => ({
                            ...prev!,
                            teardown_required: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm font-medium text-gray-700">Teardown Required</span>
                    </label>
                  </div>

                  {/* Column 3: Dropoff */}
                  <div className="flex-1">
                    <label className={labelClassName}>Dropoff Time</label>
                    <input
                      type="text"
                      className={inputClassName}
                      placeholder="Dropoff Time"
                      value={workTracker?.dropoff_time ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({ ...prev!, dropoff_time: e.target.value }))
                      }
                    />
                    <label className={labelClassName}>Dropoff POC</label>
                    <input
                      type="text"
                      className={inputClassName}
                      placeholder="Dropoff POC"
                      value={workTracker?.dropoff_poc ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({ ...prev!, dropoff_poc: e.target.value }))
                      }
                    />
                    <label className={labelClassName}>Dropoff Address</label>
                    <AddressAutocomplete
                      className="bg-white"
                      onAddressSelect={(data) =>
                        setDropOffAddress({
                          ...data,
                          addressUuid: dropOffAddress?.addressUuid ?? null,
                        })
                      }
                      initialValue={dropOffAddress?.address || ""}
                    />
                    <label className={labelClassName}>Dropoff Instructions</label>
                    <textarea
                      className="w-full text-sm border p-1 rounded bg-white"
                      placeholder="Dropoff Instructions"
                      value={workTracker?.dropoff_instructions ?? ""}
                      onChange={(e) =>
                        setWorkTracker((prev) => ({
                          ...prev!,
                          dropoff_instructions: e.target.value || null,
                        }))
                      }
                      rows={3}
                    />
                    <label className="flex items-center gap-2 mt-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={!!workTracker?.setup_required}
                        onChange={(e) =>
                          setWorkTracker((prev) => ({
                            ...prev!,
                            setup_required: e.target.checked,
                          }))
                        }
                      />
                      <span className="text-sm font-medium text-gray-700">Setup Required</span>
                    </label>
                  </div>
                </div>

                {/* Map - below both pickup and dropoff columns */}
                <div className="mt-2">
                  <RouteMapPreview
                    origin={origin}
                    destination={dest}
                    pickUpAddress={pickUpAddress}
                    dropOffAddress={dropOffAddress}
                    isLoading={isLegFetching}
                    error={legErr}
                    distanceData={leg ?? null}
                  />
                </div>
              </div>
            </div>

            <div className="mt-4 flex justify-between items-center gap-2">
              {workTracker?.id && workTracker.id !== "-1" && (
                <button
                  className="text-sm px-3 py-1 rounded bg-red-600 text-white cursor-pointer hover:bg-red-700 transition-all duration-200 flex items-center gap-1"
                  onClick={handleDeleteWorkTracker}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
              <div className="flex-1" />
              <BillOfLadingButton
                workTracker={workTracker}
                pickUpAddress={pickUpAddress}
                dropOffAddress={dropOffAddress}
              />
              <button
                className="text-sm px-3 py-1 rounded bg-darkBlue text-white cursor-pointer hover:bg-lightBlue transition-all duration-200"
                onClick={() => setShowSaveConfirmModal(true)}
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      <EditWorkTrackerTypesModal isOpen={showEditTypes} onClose={() => setShowEditTypes(false)} />

      <Dialog open={showSaveConfirmModal} onOpenChange={setShowSaveConfirmModal}>
        <DialogContent className="max-w-md z-[2101]">
          <DialogHeader>
            <DialogTitle>Save Work Tracker</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-600">
            Saving this work tracker may notify the driver. This is the notification preview:
          </p>

          {saveNotificationPreview ? (
            <div className="rounded border border-blue-200 bg-blue-50 p-3">
              <p className="text-xs font-semibold text-blue-800">Driver notification preview</p>
              <p className="mt-1 text-sm font-semibold text-blue-900">
                {saveNotificationPreview.title}
              </p>
              <p className="text-sm text-blue-900">{saveNotificationPreview.body}</p>
            </div>
          ) : (
            <div className="rounded border border-gray-200 bg-gray-50 p-3 text-sm text-gray-700">
              No driver notification will be sent for this save.
            </div>
          )}

          <DialogFooter className="gap-2 mt-4">
            <button
              onClick={() => setShowSaveConfirmModal(false)}
              className="px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveWorkTracker}
              className="px-4 py-2 text-sm font-semibold rounded text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer"
            >
              Confirm Save
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
