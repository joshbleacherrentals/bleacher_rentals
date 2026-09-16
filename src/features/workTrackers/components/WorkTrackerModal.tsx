import { LocateFixed, X, Trash2, AlertTriangle } from "lucide-react";
import { AppTooltip } from "@/components/AppTooltip";
import { Dropdown } from "@/components/DropDown";
import { BleacherSwapPanel } from "@/features/workTrackers/components/BleacherSwapPanel";
import { useEffect, useMemo, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import AddressAutocomplete, { formatAddressLine } from "@/components/AddressAutoComplete";
import {
  useAddressFromUuid,
  saveWorkTracker,
  deleteWorkTracker,
} from "../../dashboard/db/client/db";
import { AddressData } from "../../eventConfiguration/state/useCurrentEventStore";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import LoadingSpinner from "@/components/LoadingSpinner";
import { Tables } from "../../../../database.types";
import { fetchDriverPaymentData } from "@/app/team/_lib/db";
import { readBleacherOptions } from "@/features/workTrackers/db/readBleacherOptions";
import { toLatLngString, describeDriverPay, describeDeadheadPay } from "../util";
import RouteMapPreview from "./RouteMapPreview";
import { useClerkSupabaseClient } from "@/utils/supabase/useClerkSupabaseClient";
import WorkTrackerStatusBadge from "./WorkTrackerStatusBadge";
import { EditBlock } from "@/features/dashboard/types";
import { readWorkTrackerForModal } from "@/features/dashboard/db/client/readWorkTrackerForModal";
import { SelectDriver } from "./SelectDriver";
import { useDrivers } from "../hooks/useDrivers.db";
import { useWorkTrackerTypes } from "../hooks/useWorkTrackerTypes";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { buildTripStatusNotification } from "@/features/workTrackers/db/notifications";
import {
  buildWorkTrackerSnapshot,
  classifyWorkTrackerChanges,
  isWorkTrackerInProgress,
  requiresUnacceptWarning,
  resolveEffectiveChangeType,
  resolveStatusOnSave,
  shouldSendDriverNotification,
  type WorkTrackerChangeType,
  type WorkTrackerSnapshot,
} from "@/features/workTrackers/util/workTrackerEditPolicy";
import BillOfLadingButton from "./billOfLading/BillOfLadingButton";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import {
  canEditWorkTracker,
  canReleaseWorkTracker,
} from "@/features/userAccess/logic/canEditWorkTracker";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { hasSubrentalAccessForDate } from "@/features/userAccess/logic/hasSubrentalAccessForDate";
import { useDashboardBleachersStore } from "@/features/dashboard/state/useDashboardBleachersStore";
// import { requestReview, REVIEW_REQUESTED_TITLE } from "@/features/alerts/requestReview";
import { createSuccessToast } from "@/components/toasts/SuccessToast";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery, typedGetAll } from "@/lib/powersync/typedQuery";
import { startTrace, type PerfTrace } from "@/lib/perf/perfTrace";
import { Tabs, TabsContent } from "@/components/ui/tabs";
import WorkTrackerLineItemsTab, { formatMoney } from "./WorkTrackerLineItemsTab";
import {
  calculateWorkTrackerLineItemsTotalCents,
  fetchWorkTrackerLineItems,
  reconcileRequirementLineItems,
  syncWorkTrackerLineItems,
  type DraftWorkTrackerLineItem,
} from "../db/workTrackerLineItems";
import { WorkTrackerAlertsDropDown } from "@/features/alerts/components/WorkTrackerAlertsDropDown";
import {
  getExpectedPickupStreetForWorkTracker,
  getExpectedAddressFullForWorkTracker,
  isPickupTransportationMismatch,
} from "@/features/alerts/util/workTrackerTransportation";
import { getUpcomingWindowEnd } from "@/features/alerts/util/getUpcomingWindow";
import { ContactPicker, contactDisplayName } from "@/components/ContactPicker";
import { useContacts } from "@/features/companiesContacts/hooks/useContacts";
import { getExpectedPocForWorkTracker, type PocDirection } from "../util/resolvePocContact";
import { describePocPopulateResult, type PocValue } from "../util/pocField";
import {
  getSelectableWorkTrackerTypes,
  isSingleFieldSetType as computeIsSingleFieldSetType,
} from "../util/workTrackerTypeDisplay";
import { WorkTrackerTabsHeader } from "./WorkTrackerTabsHeader";
import { WorkTrackerTimeField } from "./WorkTrackerTimeField";

type WorkTrackerModalProps = {
  selectedWorkTracker: Tables<"WorkTrackers"> | null;
  setSelectedWorkTracker: (block: Tables<"WorkTrackers"> | null) => void;
  setSelectedBlock: (block: EditBlock | null) => void;
  /**
   * Run the pickup/dropoff address + POC locators once when a NEW tracker opens. Set by the
   * dashboard's ⌘/Ctrl+click shortcut, which has no popup where the user could press the
   * locator buttons themselves.
   */
  autoPopulate?: boolean;
};

export default function WorkTrackerModal({
  selectedWorkTracker,
  setSelectedWorkTracker,
  setSelectedBlock,
  autoPopulate = false,
}: WorkTrackerModalProps) {
  const supabase = useClerkSupabaseClient();
  const queryClient = useQueryClient();
  const router = useRouter();

  // Started when the modal is handed a tracker, ended below once every query it
  // blocks on has settled — this is the delay managers actually feel after a drag.
  const openTraceRef = useRef<PerfTrace | null>(null);
  const openTraceIdRef = useRef<string | null>(null);
  if (selectedWorkTracker && openTraceIdRef.current !== selectedWorkTracker.id) {
    openTraceIdRef.current = selectedWorkTracker.id;
    openTraceRef.current = startTrace("WorkTrackerModal open → data ready");
  }

  // Fetch drivers with user data using PowerSync
  const { data: drivers = [] } = useDrivers();
  const permissions = useTeamPermissions();

  const [workTracker, setWorkTracker] = useState<Tables<"WorkTrackers"> | null>(
    selectedWorkTracker,
  );
  const pickupAddress = useAddressFromUuid(selectedWorkTracker?.pickup_address_uuid ?? null);
  const dropoffAddress = useAddressFromUuid(selectedWorkTracker?.dropoff_address_uuid ?? null);
  const [pickUpAddress, setPickUpAddress] = useState<AddressData | null>(pickupAddress);
  const [dropOffAddress, setDropOffAddress] = useState<AddressData | null>(dropoffAddress);

  const [initialStatus, setInitialStatus] = useState<Tables<"WorkTrackers">["status"]>(
    selectedWorkTracker?.status ?? "draft",
  );
  const [showSaveConfirmModal, setShowSaveConfirmModal] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  // Line items live in memory until the work tracker itself is saved (see
  // `syncWorkTrackerLineItems`) — this lets them be added before the tracker exists.
  const [lineItems, setLineItems] = useState<DraftWorkTrackerLineItem[]>([]);
  // Confirms leaving this modal (and losing unsaved changes) to go edit work
  // tracker types' QuickBooks accounts on their own admin-only page.
  const [showLeaveToEditTypesConfirm, setShowLeaveToEditTypesConfirm] = useState(false);
  const initialSnapshotRef = useRef<WorkTrackerSnapshot | null>(null);
  const pendingChangeTypeRef = useRef<WorkTrackerChangeType>("none");
  // `${bleacher_uuid}|${date}` of the draft whose fields were already auto-populated.
  const autoPopulatedKeyRef = useRef<string | null>(null);
  // ids of the auto-managed "Hauling" / "Deadhead" line items (if any) — their
  // amounts are kept in sync with pickup/dropoff/driver instead of being
  // hand-edited or button-triggered.
  const autoHaulingLineItemIdRef = useRef<string | null>(null);
  const autoDeadheadLineItemIdRef = useRef<string | null>(null);

  // Fetch available work tracker types (local-first via PowerSync)
  const { types: workTrackerTypes } = useWorkTrackerTypes();

  // For the Pickup/Dropoff POC pickers below.
  const { contacts: pocContacts } = useContacts();

  const selectedWorkTrackerType = workTrackerTypes.find(
    (t) => t.id === workTracker?.work_tracker_type_uuid,
  );
  // Every type other than "trip" uses a single set of fields (written to the
  // dropoff_* columns) instead of separate Pickup/Dropoff sections.
  // See docs/specs/work-tracker-fixed-types.md.
  const isSingleFieldSetType = computeIsSingleFieldSetType(selectedWorkTrackerType?.code);

  // The Type dropdown only ever offers the 3 canonical types, regardless of what
  // else exists in the database — see workTrackerTypeDisplay.ts.
  const selectableWorkTrackerTypes = useMemo(
    () => getSelectableWorkTrackerTypes(workTrackerTypes, workTracker?.work_tracker_type_uuid),
    [workTrackerTypes, workTracker?.work_tracker_type_uuid],
  );

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

  const distanceQueryEnabled = Boolean(origin && dest) && !isSingleFieldSetType;

  // Debug logging (disabled — was noisy on every render)
  // console.log("Distance Query Debug:", {
  //   origin,
  //   dest,
  //   pickUpPlaceId: pickUpAddress?.placeId,
  //   dropOffPlaceId: dropOffAddress?.placeId,
  //   distanceQueryEnabled,
  //   pickUpAddress,
  //   dropOffAddress,
  // });

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
  }, [selectedWorkTracker]);

  // console.log("selectedWorkTracker WorkTrackerModal", selectedWorkTracker);

  const {
    data: fetchedWorkTracker,
    isLoading: isWorkTrackerLoading,
    isError: isWorkTrackerError,
  } = useQuery({
    queryKey: ["workTracker", selectedWorkTracker?.id],
    queryFn: async () => {
      // Read locally: PowerSync already holds the tracker and its addresses, and
      // the modal only opens for a tracker that is on screen — which means it is
      // in the local DB. The network version cost 8.31s on a cold cache.
      return readWorkTrackerForModal(selectedWorkTracker!.id);
    },
    enabled: !!selectedWorkTracker && selectedWorkTracker.id !== "-1",
    refetchOnWindowFocus: false,
  });

  const isNew = selectedWorkTracker?.id === "-1";

  // One-time (non-reactive) read used only to seed `lineItems` when the modal opens —
  // after that, edits stay local until save. See `syncWorkTrackerLineItems`.
  const { data: fetchedLineItems, isLoading: isLineItemsLoading } = useQuery({
    queryKey: ["workTrackerLineItems", selectedWorkTracker?.id],
    queryFn: () => fetchWorkTrackerLineItems(selectedWorkTracker!.id),
    enabled: !!selectedWorkTracker && !isNew,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    if (isNew) {
      // New work trackers always start with one auto-calculated Hauling line item,
      // followed by one auto-calculated Deadhead line item.
      const haulingId = crypto.randomUUID();
      const deadheadId = crypto.randomUUID();
      autoHaulingLineItemIdRef.current = haulingId;
      autoDeadheadLineItemIdRef.current = deadheadId;
      setLineItems([
        {
          id: haulingId,
          type: "hauling",
          qtyDecimal: 1,
          unitAmtCents: 0,
          description: null,
          isAutomaticallyManaged: false,
        },
        {
          id: deadheadId,
          type: "deadhead",
          qtyDecimal: 1,
          unitAmtCents: 0,
          description: null,
          isAutomaticallyManaged: false,
        },
      ]);
    } else if (fetchedLineItems) {
      autoHaulingLineItemIdRef.current =
        fetchedLineItems.find((item) => item.type === "hauling")?.id ?? null;
      autoDeadheadLineItemIdRef.current =
        fetchedLineItems.find((item) => item.type === "deadhead")?.id ?? null;
      setLineItems(fetchedLineItems);
    }
  }, [selectedWorkTracker?.id, isNew, fetchedLineItems]);

  useEffect(() => {
    const selectedDriver = drivers?.find(
      (driver) => driver.driver_uuid === workTracker?.driver_uuid,
    );
    setLineItems((items) =>
      reconcileRequirementLineItems(items, {
        setupRequired: !!workTracker?.setup_required,
        teardownRequired: !!workTracker?.teardown_required,
        setupCents: selectedDriver?.setup_cents,
        teardownCents: selectedDriver?.teardown_cents,
      }),
    );
  }, [
    drivers,
    workTracker?.driver_uuid,
    workTracker?.setup_required,
    workTracker?.teardown_required,
  ]);

  // Populate pickup address from the bleacher's last known location in PS
  const handlePopulatePickupFromLastAddress = async () => {
    if (!workTracker?.bleacher_uuid || !workTracker?.date) return;

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: workTracker.bleacher_uuid,
      targetDate: workTracker.date,
      excludeWorkTrackerUuid: workTracker.id,
      direction: "past",
    });

    if (resolved) {
      setPickUpAddress({
        addressUuid: resolved.addressUuid,
        address: resolved.street,
        city: resolved.city,
        state: resolved.state,
        postalCode: resolved.postalCode,
      });
    }
  };

  const handlePopulateDropoffFromNextAddress = async () => {
    if (!workTracker?.bleacher_uuid || !workTracker?.date) return;

    const resolved = await getExpectedAddressFullForWorkTracker({
      bleacherUuid: workTracker.bleacher_uuid,
      targetDate: workTracker.date,
      excludeWorkTrackerUuid: workTracker.id,
      direction: "future",
    });

    if (resolved) {
      setDropOffAddress({
        addressUuid: resolved.addressUuid,
        address: resolved.street,
        city: resolved.city,
        state: resolved.state,
        postalCode: resolved.postalCode,
      });
    }
  };

  const setPickupPoc = (next: PocValue) =>
    setWorkTracker((prev) => ({
      ...prev!,
      pickup_poc: next.pocText,
      pickup_poc_contact_uuid: next.contactUuid,
    }));

  const setDropoffPoc = (next: PocValue) =>
    setWorkTracker((prev) => ({
      ...prev!,
      dropoff_poc: next.pocText,
      dropoff_poc_contact_uuid: next.contactUuid,
    }));

  // Populate a POC from the neighbouring event / work tracker, mirroring the address locate
  // buttons above. A neighbour holding only legacy free text is refused rather than copied:
  // the driver app dials the POC through Contacts, and free text carries no phone number.
  const handlePopulatePoc = async (direction: PocDirection, options?: { silent?: boolean }) => {
    if (!workTracker?.bleacher_uuid || !workTracker?.date) return;

    const resolution = await getExpectedPocForWorkTracker({
      bleacherUuid: workTracker.bleacher_uuid,
      targetDate: workTracker.date,
      excludeWorkTrackerUuid: workTracker.id,
      direction,
    });

    const outcome = describePocPopulateResult(resolution, direction);

    if (outcome.kind === "error") {
      // Silent = auto-population: leave the field empty rather than greeting the user with two
      // toasts they never asked for. The locator buttons stay loud.
      if (!options?.silent) createErrorToast(outcome.messages);
      return;
    }

    if (direction === "past") setPickupPoc(outcome.value);
    else setDropoffPoc(outcome.value);
  };

  // Pre-save in-memory transportation warning for pickup mismatch
  const { data: expectedPickupStreet } = useQuery({
    queryKey: [
      "work-tracker-expected-pickup-street",
      workTracker?.bleacher_uuid,
      workTracker?.date,
      workTracker?.id,
    ],
    enabled: Boolean(workTracker?.bleacher_uuid && workTracker?.date),
    refetchOnWindowFocus: false,
    queryFn: async () => {
      if (!workTracker?.bleacher_uuid || !workTracker?.date) return null;

      return getExpectedPickupStreetForWorkTracker({
        bleacherUuid: workTracker.bleacher_uuid,
        targetDate: workTracker.date,
        excludeWorkTrackerUuid: workTracker.id,
      });
    },
  });

  const showPickupTransportWarning =
    Boolean(expectedPickupStreet) &&
    Boolean(pickUpAddress?.address) &&
    isPickupTransportationMismatch(expectedPickupStreet, pickUpAddress?.address);

  const perms = usePermissionsStore();
  const allDashboardBleachers = useDashboardBleachersStore((s) => s.data);

  const bleacherZoneCompiled = useMemo(() => {
    const effectiveId = workTracker?.bleacher_uuid ?? "__none__";
    return db.selectFrom("Bleachers").select(["zone_uuid"]).where("id", "=", effectiveId).compile();
  }, [workTracker?.bleacher_uuid]);
  const { data: bleacherZoneRows } = useTypedQuery(
    bleacherZoneCompiled,
    expect<{ zone_uuid: string | null }>(),
  );
  const bleacherZoneUuid = bleacherZoneRows?.[0]?.zone_uuid ?? null;

  const canEdit = permissions.canCreateUser
    ? canEditWorkTracker({
        isAdmin: permissions.isAdmin,
        isAccountManager: permissions.isAccountManager,
        isNew,
        zoneUuid: bleacherZoneUuid,
        leadZoneIds: perms.leadZoneIds,
        accountManagerZoneIds: perms.accountManagerZoneIds,
        createdByUserId: workTracker?.created_by_user_uuid,
        userId: perms.userId,
      }) ||
      // AM with subrental access to this bleacher on the work tracker date
      (permissions.isAccountManager &&
        hasSubrentalAccessForDate({
          bleacherUuid: workTracker?.bleacher_uuid ?? null,
          date: workTracker?.date ?? null,
          accountManagerZoneIds: perms.accountManagerZoneIds,
          allBleachers: allDashboardBleachers,
        }))
    : false;

  const canRelease = canReleaseWorkTracker({
    isAdmin: permissions.isAdmin,
    zoneUuid: bleacherZoneUuid,
    leadZoneIds: perms.leadZoneIds,
    accountManagerZoneIds: perms.accountManagerZoneIds,
  });

  const amFilterId: string | null = null;
  const {
    data: bleacherOptions,
    isLoading: isBleachersLoading,
    isError: isBleachersError,
  } = useQuery({
    queryKey: ["bleacherOptions", amFilterId],
    queryFn: async () => {
      // Was a full `Bleachers` table pull over the network on every cold open.
      return readBleacherOptions(amFilterId);
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

  const modalDataPending =
    isWorkTrackerLoading || isLineItemsLoading || isBleachersLoading || isDriverPaymentLoading;

  useEffect(() => {
    if (modalDataPending) return;
    const trace = openTraceRef.current;
    if (!trace) return;
    openTraceRef.current = null;
    trace.end({
      workTrackerUuid: openTraceIdRef.current,
      note: "all blocking queries settled",
    });
  }, [modalDataPending]);

  // Once types load, set default type for new work trackers that don't yet have one
  useEffect(() => {
    if (
      workTracker?.id === "-1" &&
      !workTracker?.work_tracker_type_uuid &&
      workTrackerTypes.length > 0
    ) {
      const tripType = workTrackerTypes.find((t) => t.code === "trip") ?? workTrackerTypes[0];
      setWorkTracker((prev) => (prev ? { ...prev, work_tracker_type_uuid: tripType.id } : prev));
    }
  }, [workTrackerTypes, workTracker?.id, workTracker?.work_tracker_type_uuid]);

  useEffect(() => {
    if (selectedWorkTracker?.id === "-1") {
      setWorkTracker(selectedWorkTracker);
      setInitialStatus("draft");
      setPickUpAddress(null);
      setDropOffAddress(null);
      initialSnapshotRef.current = buildWorkTrackerSnapshot(selectedWorkTracker, null, null);
      // The "Trip" default is applied by the effect above once the types load — deliberately not
      // duplicated here, so `workTrackerTypes` can stay out of this effect's deps. It re-emits
      // while the PowerSync query settles, and re-running this would blank the addresses that
      // auto-population just filled in.
    } else if (fetchedWorkTracker) {
      console.log("fetchedWorkTracker", fetchedWorkTracker);
      const nextPickupAddress = {
        addressUuid: fetchedWorkTracker.pickupAddress?.id ?? null,
        address: fetchedWorkTracker.pickupAddress?.street ?? "",
        city: fetchedWorkTracker.pickupAddress?.city ?? "",
        state: fetchedWorkTracker.pickupAddress?.state_province ?? "",
        postalCode: fetchedWorkTracker.pickupAddress?.zip_postal ?? "",
      };
      const nextDropoffAddress = {
        addressUuid: fetchedWorkTracker.dropoffAddress?.id ?? null,
        address: fetchedWorkTracker.dropoffAddress?.street ?? "",
        city: fetchedWorkTracker.dropoffAddress?.city ?? "",
        state: fetchedWorkTracker.dropoffAddress?.state_province ?? "",
        postalCode: fetchedWorkTracker.dropoffAddress?.zip_postal ?? "",
      };
      setWorkTracker(fetchedWorkTracker.workTracker);
      setInitialStatus(fetchedWorkTracker.workTracker?.status ?? "draft");
      initialSnapshotRef.current = buildWorkTrackerSnapshot(
        fetchedWorkTracker.workTracker,
        nextPickupAddress,
        nextDropoffAddress,
      );
      setPickUpAddress(nextPickupAddress);
      setDropOffAddress(nextDropoffAddress);
    }
  }, [selectedWorkTracker, fetchedWorkTracker]);

  /**
   * ⌘/Ctrl+click on an empty dashboard cell opens this modal with no popup in between, so the
   * four locators the user would otherwise press are run for them, once, on open.
   *
   * The guard is keyed on bleacher+date rather than a plain "already ran" flag: `workTracker`
   * is seeded by the effect above, so on the first pass it can still hold the previously opened
   * tracker — populating from that would silently fill in another bleacher's addresses.
   */
  useEffect(() => {
    if (!selectedWorkTracker) {
      autoPopulatedKeyRef.current = null;
      return;
    }
    if (!autoPopulate || selectedWorkTracker.id !== "-1") return;

    const key = `${selectedWorkTracker.bleacher_uuid}|${selectedWorkTracker.date}`;
    if (autoPopulatedKeyRef.current === key) return;
    // Wait until the local state has caught up with the tracker we were handed.
    if (`${workTracker?.bleacher_uuid}|${workTracker?.date}` !== key) return;

    autoPopulatedKeyRef.current = key;

    void Promise.all([
      handlePopulatePickupFromLastAddress(),
      handlePopulateDropoffFromNextAddress(),
      handlePopulatePoc("past", { silent: true }),
      handlePopulatePoc("future", { silent: true }),
    ]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoPopulate, selectedWorkTracker, workTracker?.bleacher_uuid, workTracker?.date]);

  const handleSaveWorkTracker = async () => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const changeType = pendingChangeTypeRef.current;
      const resolvedStatus = resolveStatusOnSave(
        initialStatus,
        changeType,
        workTracker?.status ?? "draft",
      );
      // Pay is always overwritten with the current line items total on save —
      // it's shown read-only in the UI, never hand-edited.
      // Merge distance/duration from the Google Maps leg into the tracker before saving
      const trackerToSave = workTracker
        ? {
            ...workTracker,
            status: resolvedStatus,
            pay_cents: lineItemsTotalCents,
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
      const savedWorkTrackerUuid = await saveWorkTracker(
        trackerToSave,
        pickUpAddress,
        dropOffAddress,
        {
          previousStatus: initialStatus,
          changeType,
          driverUserUuid: selectedDriver?.user_uuid ?? null,
          previousPickupAddress:
            initialSnapshotRef.current?.pickupAddress?.address ?? "an unknown pickup location",
          previousPickupCity: initialSnapshotRef.current?.pickupAddress?.city ?? "",
          previousDropoffAddress:
            initialSnapshotRef.current?.dropoffAddress?.address ?? "an unknown dropoff location",
          previousDropoffCity: initialSnapshotRef.current?.dropoffAddress?.city ?? "",
        },
      );
      // Line items are only held in memory until now — persist the current draft
      // list against the (possibly newly created) work tracker id.
      await syncWorkTrackerLineItems(savedWorkTrackerUuid, lineItems);
      setShowSaveConfirmModal(false);
      // Invalidate this specific work tracker's cache so re-opening shows fresh data
      await queryClient.invalidateQueries({ queryKey: ["workTracker", workTracker?.id] });
      await queryClient.invalidateQueries({
        queryKey: ["workTrackerLineItems", savedWorkTrackerUuid],
      });
      await queryClient.invalidateQueries({ queryKey: ["work-trackers"], refetchType: "active" });
      setSelectedWorkTracker(null);
      setSelectedBlock(null);
    } catch (error) {
      createErrorToast(["Failed to Save Work Tracker:", String(error)]);
    } finally {
      setIsSaving(false);
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
      await deleteWorkTracker(workTracker.id, {
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
      await queryClient.invalidateQueries({ queryKey: ["work-trackers"], refetchType: "active" });
      setSelectedWorkTracker(null);
      setSelectedBlock(null);
    } catch (error) {
      createErrorToast(["Failed to Delete Work Tracker:", String(error)]);
    }
  };

  // Review-request flow disabled per boss feedback — kept for future use
  // const handleRequestReview = async () => {
  //   if (!workTracker?.id || workTracker.id === "-1" || !bleacherZoneUuid) return;
  //   try {
  //     const bleacherLabel =
  //       bleacherOptions?.find((b) => b.uuid === workTracker.bleacher_uuid)?.label ?? "Unknown";
  //     await requestReview({
  //       entityUuid: workTracker.id,
  //       entityType: "work_tracker",
  //       bleacherZoneUuid,
  //       message: `Review requested for Work Tracker on ${bleacherLabel} (${workTracker.date ?? "no date"})`,
  //       entityDescription: `Work Tracker – ${bleacherLabel}`,
  //     });
  //     createSuccessToast(["Review request sent to Lead Account Manager"]);
  //   } catch (error) {
  //     createErrorToast(["Failed to request review:", String(error)]);
  //   }
  // };

  // The same breakdown the button applies, so the tooltip always shows the work
  // that clicking would actually do.
  const payBreakdown = useMemo(
    () => (driverPaymentData && leg ? describeDriverPay(driverPaymentData, leg) : null),
    [driverPaymentData, leg],
  );

  // Same trip (`leg`) and driver (`driverPaymentData`), but at the driver's flat
  // deadhead rate instead of their haul rate.
  const deadheadBreakdown = useMemo(
    () => (driverPaymentData && leg ? describeDeadheadPay(driverPaymentData, leg) : null),
    [driverPaymentData, leg],
  );

  // Keep the auto-managed Hauling/Deadhead line items' amounts in step with
  // payBreakdown/deadheadBreakdown — themselves derived from pickup/dropoff (via
  // `leg`) and the selected driver (via `driverPaymentData`) — instead of
  // requiring their own calculate button.
  useEffect(() => {
    const haulingId = autoHaulingLineItemIdRef.current;
    const deadheadId = autoDeadheadLineItemIdRef.current;
    if ((!haulingId || !payBreakdown) && (!deadheadId || !deadheadBreakdown)) return;

    setLineItems((prev) =>
      prev.map((item) => {
        if (item.id === haulingId && payBreakdown) {
          return {
            ...item,
            qtyDecimal: 1,
            unitAmtCents: Math.round(payBreakdown.amount * 100),
            description: payBreakdown.text,
          };
        }
        if (item.id === deadheadId && deadheadBreakdown) {
          return {
            ...item,
            qtyDecimal: 1,
            unitAmtCents: Math.round(deadheadBreakdown.amount * 100),
            description: deadheadBreakdown.text,
          };
        }
        return item;
      }),
    );
  }, [payBreakdown, deadheadBreakdown]);

  const lineItemsTotalCents = useMemo(
    () => calculateWorkTrackerLineItemsTotalCents(lineItems),
    [lineItems],
  );

  const labelClassName = "block text-sm font-medium text-gray-700 mt-1";
  const inputClassName = "w-full p-2 border rounded bg-white";

  const currentSnapshot = buildWorkTrackerSnapshot(workTracker, pickUpAddress, dropOffAddress);
  const statusChanged = (workTracker?.status ?? "draft") !== initialStatus;

  const fieldChangeType = useMemo(() => {
    const before = initialSnapshotRef.current;
    const after = currentSnapshot;
    if (!before || !after) return isNew ? ("un-accept" as const) : ("none" as const);
    return classifyWorkTrackerChanges(before, after);
  }, [currentSnapshot, isNew]);

  const currentChangeType = useMemo(
    () => resolveEffectiveChangeType(fieldChangeType, statusChanged, isNew),
    [fieldChangeType, statusChanged, isNew],
  );

  const isInProgress = !isNew && isWorkTrackerInProgress(initialStatus);
  const canEditFields = canEdit;
  const showUnacceptWarning = requiresUnacceptWarning(initialStatus, currentChangeType);

  const effectiveNextStatus = resolveStatusOnSave(
    initialStatus,
    currentChangeType === "none" ? "un-accept" : currentChangeType,
    workTracker?.status ?? "draft",
  );

  const saveNotificationPreview = shouldSendDriverNotification(
    currentChangeType === "none" ? "un-accept" : currentChangeType,
    workTracker?.id === "-1" ? "draft" : initialStatus,
    workTracker?.id === "-1",
    effectiveNextStatus,
  )
    ? buildTripStatusNotification({
        previousStatus: workTracker?.id === "-1" ? "draft" : initialStatus,
        nextStatus: effectiveNextStatus,
        pickupAddress:
          pickUpAddress?.address ?? pickupAddress?.address ?? "an unknown pickup location",
        pickupCity: pickUpAddress?.city ?? pickupAddress?.city ?? "",
        dropoffAddress:
          dropOffAddress?.address ?? dropoffAddress?.address ?? "an unknown dropoff location",
        dropoffCity: dropOffAddress?.city ?? dropoffAddress?.city ?? "",
        date: workTracker?.date ?? null,
      })
    : null;

  const handleSaveClick = () => {
    if (isSaving) return;

    const before = initialSnapshotRef.current;
    const after = buildWorkTrackerSnapshot(workTracker, pickUpAddress, dropOffAddress);
    const fieldChangeType =
      before && after ? classifyWorkTrackerChanges(before, after) : isNew ? "un-accept" : "none";

    const hasStatusChange = (workTracker?.status ?? "draft") !== initialStatus;

    if (fieldChangeType === "none" && !hasStatusChange) {
      createErrorToast(["No changes to save."]);
      return;
    }

    const changeType = resolveEffectiveChangeType(fieldChangeType, hasStatusChange, isNew);
    pendingChangeTypeRef.current = changeType;

    const resolvedStatus = resolveStatusOnSave(
      initialStatus,
      changeType,
      workTracker?.status ?? "draft",
    );
    const willNotify = shouldSendDriverNotification(
      changeType,
      isNew ? "draft" : initialStatus,
      isNew,
      resolvedStatus,
    );

    if (!willNotify) {
      void handleSaveWorkTracker();
      return;
    }

    setShowSaveConfirmModal(true);
  };

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
            // Only the form body scrolls: the title stays put and the footer
            // (Delete, BoL, Save) stays reachable without hunting for it.
            className=" p-4 rounded shadow w-[900px] max-h-[90vh] flex flex-col overflow-hidden transition-colors duration-200 bg-white"
            data-testid="work-tracker-modal"
          >
            <div className="flex flex-row justify-between items-start">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold mb-2">
                  {selectedWorkTracker.id === "-1" ? "Create Work Tracker" : "Edit Work Tracker"}
                </h2>
                {selectedWorkTracker.id !== "-1" && (
                  <WorkTrackerAlertsDropDown workTrackerUuid={selectedWorkTracker.id} />
                )}
              </div>
              <X
                className="-mt-1 cursor-pointer text-black/30 hover:text-black hover:drop-shadow-[0_1px_1px_rgba(0,0,0,0.3)] transition-all duration-200"
                onClick={() => setSelectedWorkTracker(null)}
              />
            </div>
            {/* Read-only banner for non-owners */}
            {!canEdit && !isNew && (
              <div className="mb-2 rounded border border-yellow-300 bg-yellow-50 px-3 py-2 text-sm text-yellow-800">
                You have read-only access to this work tracker.
              </div>
            )}
            {isInProgress && canEdit && (
              <div className="mb-2 rounded border border-blue-200 bg-blue-50 px-3 py-2 text-sm text-blue-900">
                This trip is in progress. Saving driver-visible changes will notify the driver and
                preserve their current workflow step.
              </div>
            )}
            <Tabs defaultValue="details" className="flex-1 min-h-0">
              <WorkTrackerTabsHeader
                types={selectableWorkTrackerTypes}
                selectedTypeId={workTracker?.work_tracker_type_uuid}
                onSelectType={(id) =>
                  setWorkTracker((prev) => ({
                    ...prev!,
                    work_tracker_type_uuid: id,
                  }))
                }
                disabled={!canEditFields}
                isAdmin={permissions.isAdmin}
                onEditTypesClick={() => setShowLeaveToEditTypesConfirm(true)}
              />

              <div className="flex-1 min-h-0 overflow-y-auto">
                <TabsContent value="details">
                  {/*
                  min-w-0 is load-bearing: browsers give <fieldset> a UA
                  `min-inline-size: min-content`, so it refuses to shrink below its content and
                  overflows the modal's fixed 900px width — no amount of min-w-0 on descendants
                  can override that from the inside.
                */}
                  <fieldset className="min-w-0" disabled={!canEditFields}>
                    <div className="flex flex-row gap-4">
                      {/* Column 1: Global Info */}
                      <div className="flex-1 min-w-0">
                        <div className="flex flex-row gap-2">
                          <div className="flex-[2] min-w-0">
                            <label className={labelClassName}>Driver</label>
                            <SelectDriver
                              value={workTracker?.driver_uuid ?? null}
                              onChange={(id) =>
                                setWorkTracker((prev) => ({
                                  ...prev!,
                                  driver_uuid: id,
                                }))
                              }
                              placeholder="Select Driver"
                              date={workTracker?.date ?? null}
                              disabled={!canEditFields}
                              showAllDrivers={!canEditFields}
                            />
                          </div>
                          {/* Fixed width, not flex-1: a long driver name used to eat this
                            column down to nothing and spill its label into Pickup Time. */}
                          <div className="w-24 shrink-0" data-testid="assigned-bleacher-select">
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
                              disabled={!canEditFields}
                            />
                          </div>
                        </div>

                        <BleacherSwapPanel
                          assignedBleacherUuid={workTracker?.bleacher_uuid ?? null}
                          actualBleacherUuid={workTracker?.actual_bleacher_uuid ?? null}
                          reasonCode={workTracker?.bleacher_change_reason ?? null}
                          bleacherOptions={bleacherOptions ?? []}
                          canEdit={canEditFields}
                          labelClassName={labelClassName}
                          onChange={({ actualBleacherUuid, reasonCode }) =>
                            setWorkTracker((prev) => ({
                              ...prev!,
                              actual_bleacher_uuid: actualBleacherUuid,
                              bleacher_change_reason: reasonCode,
                            }))
                          }
                        />

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
                        <div className="flex items-center gap-2">
                          <label className={labelClassName}>Status</label>
                        </div>
                        <div className="flex items-center justify-center p-3 bg-gray-50 rounded border">
                          <WorkTrackerStatusBadge
                            status={workTracker?.status ?? "draft"}
                            onStatusChange={(newStatus) => {
                              setWorkTracker((prev) => ({
                                ...prev!,
                                status: newStatus,
                              }));
                            }}
                            canEdit={canEdit && canRelease}
                            workTrackerId={workTracker?.id !== "-1" ? workTracker?.id : undefined}
                            // Review-request disabled per boss feedback
                            // onRequestReview={
                            //   canEdit && !canRelease && !isNew ? () => handleRequestReview() : undefined
                            // }
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
                      </div>

                      {/* Columns 2 & 3: Pickup, Dropoff, and Map */}
                      <div className="flex-[2] min-w-0 flex flex-col gap-4">
                        <div className="flex flex-row gap-4">
                          {/* Column 2: Pickup — only shown for "Trip", which is the
                            only type that needs a separate pickup leg. */}
                          {!isSingleFieldSetType && (
                            <div className="flex-1 min-w-0">
                              <label className={labelClassName}>Pickup Time</label>
                              <WorkTrackerTimeField
                                mode={workTracker?.pickup_time_mode}
                                start={workTracker?.pickup_time_start}
                                end={workTracker?.pickup_time_end}
                                onChange={(next) =>
                                  setWorkTracker((prev) => ({
                                    ...prev!,
                                    pickup_time_mode: next.mode,
                                    pickup_time_start: next.start,
                                    pickup_time_end: next.end,
                                  }))
                                }
                                disabled={!canEditFields}
                                testIdPrefix="pickup"
                              />
                              <label className={labelClassName}>Pickup POC</label>
                              <div className="flex flex-row gap-2 items-center">
                                <div className="flex-1 min-w-0">
                                  <ContactPicker
                                    label=""
                                    contactId={workTracker?.pickup_poc_contact_uuid ?? null}
                                    contacts={pocContacts}
                                    fallbackLabel={workTracker?.pickup_poc ?? null}
                                    onSelect={(contact) =>
                                      setPickupPoc({
                                        contactUuid: contact.id,
                                        pocText: contactDisplayName(contact),
                                      })
                                    }
                                    onClear={() =>
                                      setPickupPoc({ contactUuid: null, pocText: null })
                                    }
                                    placeholder="Search contacts..."
                                    // WorkTrackerModal isn't a Radix dialog: it paints its own
                                    // z-[2000] overlay, so the picker's dialogs need raising past
                                    // it — matches the z-[2101] its save-confirm dialog uses.
                                    contentClassName="z-[2101]"
                                  />
                                </div>
                                {canEditFields && (
                                  <AppTooltip content="Populate from previous event contact">
                                    <button
                                      type="button"
                                      onClick={() => handlePopulatePoc("past")}
                                      className="text-gray-400 hover:text-darkBlue transition-colors"
                                    >
                                      <LocateFixed className="h-5 w-5" />
                                    </button>
                                  </AppTooltip>
                                )}
                              </div>
                              <div className="flex items-center gap-2">
                                <label className={labelClassName}>Pickup Address</label>
                                {showPickupTransportWarning && (
                                  <AppTooltip content="Pickup differs from last location. Use locate.">
                                    <span className="mt-1 inline-flex text-amber-600">
                                      <AlertTriangle className="h-4 w-4" />
                                    </span>
                                  </AppTooltip>
                                )}
                              </div>
                              <div className="flex flex-row gap-2 items-center">
                                <AddressAutocomplete
                                  className="bg-white"
                                  onAddressSelect={(data) =>
                                    setPickUpAddress({
                                      ...data,
                                      addressUuid: pickUpAddress?.addressUuid ?? null,
                                    })
                                  }
                                  initialValue={formatAddressLine({
                                    street: pickUpAddress?.address,
                                    city: pickUpAddress?.city,
                                    state: pickUpAddress?.state,
                                    postalCode: pickUpAddress?.postalCode,
                                  })}
                                />
                                {canEditFields && (
                                  <AppTooltip content="Populate from last known bleacher location">
                                    <button
                                      type="button"
                                      onClick={handlePopulatePickupFromLastAddress}
                                      className="text-gray-400 hover:text-darkBlue transition-colors"
                                    >
                                      <LocateFixed className="h-5 w-5" />
                                    </button>
                                  </AppTooltip>
                                )}
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
                                <span className="text-sm font-medium text-gray-700">
                                  Teardown Required
                                </span>
                              </label>
                            </div>
                          )}

                          {/* Column 3: Dropoff — for single-field-set types (everything
                            but "Trip") this is the only column shown, so its labels
                            drop the "Dropoff" prefix. The values still live in the
                            dropoff_* columns either way. */}
                          <div className="flex-1 min-w-0">
                            <label className={labelClassName}>
                              {isSingleFieldSetType ? "Time" : "Dropoff Time"}
                            </label>
                            <WorkTrackerTimeField
                              mode={workTracker?.dropoff_time_mode}
                              start={workTracker?.dropoff_time_start}
                              end={workTracker?.dropoff_time_end}
                              onChange={(next) =>
                                setWorkTracker((prev) => ({
                                  ...prev!,
                                  dropoff_time_mode: next.mode,
                                  dropoff_time_start: next.start,
                                  dropoff_time_end: next.end,
                                }))
                              }
                              disabled={!canEditFields}
                              testIdPrefix="dropoff"
                            />
                            <label className={labelClassName}>
                              {isSingleFieldSetType ? "POC" : "Dropoff POC"}
                            </label>
                            <div className="flex flex-row gap-2 items-center">
                              <div className="flex-1 min-w-0">
                                <ContactPicker
                                  label=""
                                  contactId={workTracker?.dropoff_poc_contact_uuid ?? null}
                                  contacts={pocContacts}
                                  fallbackLabel={workTracker?.dropoff_poc ?? null}
                                  onSelect={(contact) =>
                                    setDropoffPoc({
                                      contactUuid: contact.id,
                                      pocText: contactDisplayName(contact),
                                    })
                                  }
                                  onClear={() =>
                                    setDropoffPoc({ contactUuid: null, pocText: null })
                                  }
                                  placeholder="Search contacts..."
                                  contentClassName="z-[2101]"
                                />
                              </div>
                              {canEditFields && (
                                <AppTooltip content="Populate from next event contact">
                                  <button
                                    type="button"
                                    onClick={() => handlePopulatePoc("future")}
                                    className="text-gray-400 hover:text-darkBlue transition-colors"
                                  >
                                    <LocateFixed className="h-5 w-5" />
                                  </button>
                                </AppTooltip>
                              )}
                            </div>
                            <label className={labelClassName}>
                              {isSingleFieldSetType ? "Address" : "Dropoff Address"}
                            </label>
                            <div className="flex flex-row gap-2 items-center">
                              <AddressAutocomplete
                                className="bg-white"
                                onAddressSelect={(data) =>
                                  setDropOffAddress({
                                    ...data,
                                    addressUuid: dropOffAddress?.addressUuid ?? null,
                                  })
                                }
                                initialValue={formatAddressLine({
                                  street: dropOffAddress?.address,
                                  city: dropOffAddress?.city,
                                  state: dropOffAddress?.state,
                                  postalCode: dropOffAddress?.postalCode,
                                })}
                              />
                              {canEditFields && (
                                <AppTooltip content="Populate from next known bleacher location">
                                  <button
                                    type="button"
                                    onClick={handlePopulateDropoffFromNextAddress}
                                    className="text-gray-400 hover:text-darkBlue transition-colors"
                                  >
                                    <LocateFixed className="h-5 w-5" />
                                  </button>
                                </AppTooltip>
                              )}
                            </div>
                            <label className={labelClassName}>
                              {isSingleFieldSetType ? "Instructions" : "Dropoff Instructions"}
                            </label>
                            <textarea
                              className="w-full text-sm border p-1 rounded bg-white"
                              placeholder={
                                isSingleFieldSetType ? "Instructions" : "Dropoff Instructions"
                              }
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
                              <span className="text-sm font-medium text-gray-700">
                                Setup Required
                              </span>
                            </label>
                            {/* Teardown Required normally lives in the Pickup column, which
                              single-field-set types don't show — surface it here instead so
                              it isn't lost. */}
                            {isSingleFieldSetType && (
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
                                <span className="text-sm font-medium text-gray-700">
                                  Teardown Required
                                </span>
                              </label>
                            )}
                          </div>
                        </div>

                        {/* Map - below both pickup and dropoff columns. Only "Trip" has
                          two legs to plot a route between. */}
                        {!isSingleFieldSetType && (
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
                        )}
                      </div>
                    </div>
                  </fieldset>
                </TabsContent>

                <TabsContent value="line-items">
                  <WorkTrackerLineItemsTab
                    lineItems={lineItems}
                    onChange={(items) =>
                      setLineItems(
                        reconcileRequirementLineItems(items, {
                          setupRequired: !!workTracker?.setup_required,
                          teardownRequired: !!workTracker?.teardown_required,
                        }),
                      )
                    }
                    canEdit={canEditFields}
                    isLoading={isLineItemsLoading}
                  />
                </TabsContent>
              </div>
            </Tabs>

            <div className="mt-4 shrink-0 flex justify-between items-center gap-2">
              {canEditFields && !isInProgress && workTracker?.id && workTracker.id !== "-1" && (
                <button
                  className="text-sm px-3 py-1 rounded bg-red-600 text-white cursor-pointer hover:bg-red-700 transition-all duration-200 flex items-center gap-1"
                  onClick={handleDeleteWorkTracker}
                >
                  <Trash2 className="w-4 h-4" />
                  Delete
                </button>
              )}
              <div className="flex-1" />
              {lineItems.length > 0 && (
                <span className="text-sm">
                  <span className="font-semibold">Total</span>{" "}
                  <span className="font-bold">{formatMoney(lineItemsTotalCents)}</span>
                </span>
              )}
              <BillOfLadingButton
                workTracker={workTracker}
                pickUpAddress={pickUpAddress}
                dropOffAddress={dropOffAddress}
              />
              {canEditFields && (
                <button
                  className="text-sm px-3 py-1 rounded bg-darkBlue text-white cursor-pointer hover:bg-lightBlue transition-all duration-200 disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-darkBlue"
                  onClick={handleSaveClick}
                  disabled={isSaving}
                >
                  {isSaving ? "Saving..." : "Save"}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      <Dialog open={showLeaveToEditTypesConfirm} onOpenChange={setShowLeaveToEditTypesConfirm}>
        <DialogContent className="max-w-md z-[2101]">
          <DialogHeader>
            <DialogTitle>Leave to edit types?</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-gray-600">
            Any unsaved changes to this work tracker will be lost.
          </p>
          <DialogFooter className="gap-2 mt-4">
            <button
              onClick={() => setShowLeaveToEditTypesConfirm(false)}
              className="px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition cursor-pointer"
            >
              Cancel
            </button>
            <button
              onClick={() => router.push("/work-tracker-types")}
              className="px-4 py-2 text-sm font-semibold rounded text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer"
            >
              Continue
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog
        open={showSaveConfirmModal}
        onOpenChange={(open) => {
          if (isSaving) return;
          setShowSaveConfirmModal(open);
        }}
      >
        <DialogContent className="max-w-md z-[2101]">
          <DialogHeader>
            <DialogTitle>Save Work Tracker</DialogTitle>
          </DialogHeader>

          <p className="text-sm text-gray-600">
            Saving this work tracker may notify the driver. This is the notification preview:
          </p>

          {showUnacceptWarning && (
            <div className="rounded border border-amber-300 bg-amber-50 p-3">
              <p className="text-sm text-amber-900">
                This trip has already been accepted by the driver. Saving these changes will move it
                back to <span className="font-semibold">Released</span> status, and the driver will
                need to accept it again.
              </p>
            </div>
          )}

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
              disabled={isSaving}
              className="px-4 py-2 text-sm font-medium rounded border border-gray-300 hover:bg-gray-50 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-transparent"
            >
              Cancel
            </button>
            <button
              onClick={handleSaveWorkTracker}
              disabled={isSaving}
              className="px-4 py-2 text-sm font-semibold rounded text-white bg-blue-600 hover:bg-blue-700 transition cursor-pointer disabled:cursor-not-allowed disabled:opacity-70 disabled:hover:bg-blue-600 flex items-center justify-center gap-2"
            >
              {isSaving && (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />
              )}
              {isSaving ? "Saving..." : "Confirm Save"}
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
