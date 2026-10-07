"use client";
import { useEffect, useMemo } from "react";
import { Database } from "../../../../../../database.types";
import type { Bleacher, BleacherEvent, DamageSeverity, DashboardEvent } from "../../../types";
import { effectiveColumnDamage } from "@/lib/damageReportSeverity";
import { useDashboardBleachersStore } from "../../../state/useDashboardBleachersStore";
import { useDashboardEventsStore } from "../../../state/useDashboardEventsStore";
import { usePsBleachers } from "./usePsBleachers";
import { usePsHomeBases } from "./usePsHomeBases";
import { usePsBleacherEvents } from "./usePsBleacherEvents";
import { usePsEvents } from "./usePsEvents";
import { usePsAddresses } from "./usePsAddresses";
import { usePsBlocks } from "./usePsBlocks";
import { usePsWorkTrackers } from "./usePsWorkTrackers";
import { usePsDrivers } from "./usePsDrivers";
import { usePsUsers } from "./usePsUsers";
import { usePsBleacherMaintEvents } from "./usePsBleacherMaintEvents";
import { usePsMaintenanceEvents } from "./usePsMaintenanceEvents";
import { usePsDamageReports } from "./usePsDamageReports";
import { usePsAlertCounts } from "./usePsAlertCounts";
import { usePsZones } from "./usePsZones";
import { usePsStorageLocations } from "./usePsStorageLocations";
import { usePsSubrentalEvents } from "./usePsSubrentalEvents";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { formatWorkTrackerTime, type WorkTrackerTimeMode } from "@/features/workTrackers/util";

function toBool(v: number | null | boolean): boolean {
  if (typeof v === "boolean") return v;
  if (typeof v === "number") return v !== 0;
  return false;
}

export function useDashboardPowerSync(opts?: {
  onlyShowMyEvents?: boolean;
  clerkUserId?: string | null;
}) {
  // ── Individual reactive queries ──────────────────────────────────────
  const allBleacherRows = usePsBleachers();
  const { isAdmin, isAccountManager, accountManagerZoneIds } = usePermissionsStore();
  const homeBaseRows = usePsHomeBases();
  const bleacherEventRows = usePsBleacherEvents();
  const eventRows = usePsEvents();
  const addressRows = usePsAddresses();
  const blockRows = usePsBlocks();
  const workTrackerRows = usePsWorkTrackers();
  const driverRows = usePsDrivers();
  const userRows = usePsUsers();
  const bleacherMaintEventRows = usePsBleacherMaintEvents();
  const maintenanceEventRows = usePsMaintenanceEvents();
  const damageReportRows = usePsDamageReports();
  const zoneRows = usePsZones();
  const storageLocationRows = usePsStorageLocations();
  const subrentalEventRows = usePsSubrentalEvents();

  // Alert counts → pushes into useAlertCountsStore reactively
  usePsAlertCounts();

  // ── Lookup maps (rebuilt when underlying data changes) ───────────────
  const homeBaseMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const hb of homeBaseRows) m.set(hb.id, hb.home_base_name ?? "");
    return m;
  }, [homeBaseRows]);

  const zoneMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const z of zoneRows) m.set(z.id, z.display_name ?? "");
    return m;
  }, [zoneRows]);

  const storageLocationMap = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of storageLocationRows) m.set(s.id, s.name ?? "");
    return m;
  }, [storageLocationRows]);

  const addressMap = useMemo(() => {
    const m = new Map<
      string,
      { street: string; city: string; state_province: string; zip_postal: string | null }
    >();
    for (const a of addressRows)
      m.set(a.id, {
        street: a.street ?? "",
        city: a.city ?? "",
        state_province: a.state_province ?? "",
        zip_postal: a.zip_postal,
      });
    return m;
  }, [addressRows]);

  const eventMap = useMemo(() => {
    const m = new Map<string, (typeof eventRows)[number]>();
    for (const e of eventRows) m.set(e.id, e);
    return m;
  }, [eventRows]);

  const driverUserMap = useMemo(() => {
    const driverToUser = new Map<string, string>();
    for (const d of driverRows) {
      if (d.user_uuid) driverToUser.set(d.id, d.user_uuid);
    }
    const userMap = new Map<string, { first_name: string | null; last_name: string | null }>();
    for (const u of userRows)
      userMap.set(u.id, { first_name: u.first_name, last_name: u.last_name });
    return { driverToUser, userMap };
  }, [driverRows, userRows]);

  const maintEventMap = useMemo(() => {
    const m = new Map<string, (typeof maintenanceEventRows)[number]>();
    for (const me of maintenanceEventRows) m.set(me.id, me);
    return m;
  }, [maintenanceEventRows]);

  // ── Resolve current user UUID for "only my events" filter ────────────
  const currentUserUuid = useMemo(() => {
    if (!opts?.onlyShowMyEvents || !opts.clerkUserId) return null;
    const user = userRows.find((u) => u.clerk_user_id === opts.clerkUserId);
    return user?.id ?? null;
  }, [opts?.onlyShowMyEvents, opts?.clerkUserId, userRows]);

  // ── Assemble Bleacher[] ──────────────────────────────────────────────
  const bleachers: Bleacher[] = useMemo(() => {
    // Pre-group child rows by bleacher_uuid for O(n) assembly
    const besByBleacher = new Map<string, typeof bleacherEventRows>();
    for (const be of bleacherEventRows) {
      if (!be.bleacher_uuid) continue;
      const arr = besByBleacher.get(be.bleacher_uuid);
      if (arr) arr.push(be);
      else besByBleacher.set(be.bleacher_uuid, [be]);
    }

    const blocksByBleacher = new Map<string, typeof blockRows>();
    for (const bl of blockRows) {
      if (!bl.bleacher_uuid) continue;
      const arr = blocksByBleacher.get(bl.bleacher_uuid);
      if (arr) arr.push(bl);
      else blocksByBleacher.set(bl.bleacher_uuid, [bl]);
    }

    const wtsByBleacher = new Map<string, typeof workTrackerRows>();
    for (const wt of workTrackerRows) {
      if (!wt.bleacher_uuid) continue;
      const arr = wtsByBleacher.get(wt.bleacher_uuid);
      if (arr) arr.push(wt);
      else wtsByBleacher.set(wt.bleacher_uuid, [wt]);
    }

    const bmesByBleacher = new Map<string, typeof bleacherMaintEventRows>();
    for (const bme of bleacherMaintEventRows) {
      if (!bme.bleacher_uuid) continue;
      const arr = bmesByBleacher.get(bme.bleacher_uuid);
      if (arr) arr.push(bme);
      else bmesByBleacher.set(bme.bleacher_uuid, [bme]);
    }

    const srsByBleacher = new Map<string, typeof subrentalEventRows>();
    for (const sr of subrentalEventRows) {
      if (!sr.bleacher_uuid) continue;
      const arr = srsByBleacher.get(sr.bleacher_uuid);
      if (arr) arr.push(sr);
      else srsByBleacher.set(sr.bleacher_uuid, [sr]);
    }

    const drsByBleacher = new Map<string, typeof damageReportRows>();
    for (const dr of damageReportRows) {
      if (!dr.bleacher_uuid) continue;
      const arr = drsByBleacher.get(dr.bleacher_uuid);
      if (arr) arr.push(dr);
      else drsByBleacher.set(dr.bleacher_uuid, [dr]);
    }

    const normalRows = allBleacherRows.map((b) => {
      // Home bases
      const summerHomeBase = b.summer_home_base_uuid
        ? {
            homeBaseUuid: b.summer_home_base_uuid,
            name: homeBaseMap.get(b.summer_home_base_uuid) ?? "",
          }
        : null;
      const winterHomeBase = b.winter_home_base_uuid
        ? {
            homeBaseUuid: b.winter_home_base_uuid,
            name: homeBaseMap.get(b.winter_home_base_uuid) ?? "",
          }
        : null;

      // Bleacher events → BleacherEvent[]
      const relatedBEs = besByBleacher.get(b.id) ?? [];
      const bleacherEvents: BleacherEvent[] = relatedBEs
        .map((be) => {
          if (!be.event_uuid) return null;
          const ev = eventMap.get(be.event_uuid);
          if (!ev) return null;
          const addr = ev.address_uuid ? addressMap.get(ev.address_uuid) : undefined;
          return {
            eventUuid: ev.id,
            bleacherEventUuid: be.id,
            eventName: ev.event_name ?? "",
            eventStart: ev.event_start ?? "",
            eventEnd: ev.event_end ?? "",
            hslHue: ev.hsl_hue,
            booked: ev.event_status === "booked",
            goodshuffleUrl: ev.goodshuffle_url ?? null,
            address: addr?.street ?? "",
          };
        })
        .filter((x): x is BleacherEvent => x !== null);

      // Blocks
      const blocks = (blocksByBleacher.get(b.id) ?? []).map((bl) => ({
        blockUuid: bl.id,
        text: bl.text ?? "",
        date: bl.date ?? "",
        createdByUserUuid: bl.created_by_user_uuid ?? null,
      }));

      // Work trackers
      const relatedWTs = wtsByBleacher.get(b.id) ?? [];
      const workTrackers = relatedWTs.map((wt) => {
        const driverUserUuid = wt.driver_uuid
          ? driverUserMap.driverToUser.get(wt.driver_uuid)
          : undefined;
        const driverUser = driverUserUuid ? driverUserMap.userMap.get(driverUserUuid) : undefined;
        const dropoffAddr = wt.dropoff_address_uuid
          ? addressMap.get(wt.dropoff_address_uuid)
          : undefined;
        return {
          workTrackerUuid: wt.id,
          date: wt.date ?? "",
          status: (wt.status ?? "draft") as Database["public"]["Enums"]["worktracker_status"],
          pickupTime: formatWorkTrackerTime(
            wt.pickup_time_mode as WorkTrackerTimeMode | null,
            wt.pickup_time_start,
            wt.pickup_time_end,
          ),
          dropoffTime: formatWorkTrackerTime(
            wt.dropoff_time_mode as WorkTrackerTimeMode | null,
            wt.dropoff_time_start,
            wt.dropoff_time_end,
          ),
          driverUuid: wt.driver_uuid ?? null,
          driverFirstName: driverUser?.first_name ?? null,
          driverLastName: driverUser?.last_name ?? null,
          dropoffAddress: dropoffAddr?.street ?? null,
        };
      });

      // Maintenance events
      const relatedBMEs = bmesByBleacher.get(b.id) ?? [];
      const maintenanceEvents = relatedBMEs
        .map((bme) => {
          if (!bme.maintenance_event_uuid) return null;
          const me = maintEventMap.get(bme.maintenance_event_uuid);
          if (!me) return null;
          const addr = me.address_uuid ? addressMap.get(me.address_uuid) : undefined;
          return {
            maintenanceEventUuid: me.id,
            bleacherMaintEventUuid: bme.id,
            eventName: me.event_name ?? "Maintenance / Repair",
            eventStart: me.event_start ?? "",
            eventEnd: me.event_end ?? "",
            costCents: me.cost_cents,
            address: addr?.street ?? "",
          };
        })
        .filter((x): x is NonNullable<typeof x> => x !== null);

      // Damage reports
      const relatedDRs = drsByBleacher.get(b.id) ?? [];
      const damageReports = relatedDRs.map((dr) => {
        const linkedWt = relatedWTs.find(
          (wt) =>
            wt.pre_inspection_uuid === dr.inspection_uuid ||
            wt.post_inspection_uuid === dr.inspection_uuid,
        );
        return {
          damageReportUuid: dr.id,
          bleacherUuid: dr.bleacher_uuid ?? b.id,
          inspectionUuid: dr.inspection_uuid ?? null,
          isSafeToSit: toBool(dr.is_safe_to_sit),
          isSafeToHaul: toBool(dr.is_safe_to_haul),
          seatDamage: effectiveColumnDamage(dr.seat_damage, dr.is_safe_to_sit) as DamageSeverity,
          haulDamage: effectiveColumnDamage(dr.haul_damage, dr.is_safe_to_haul) as DamageSeverity,
          note: dr.note,
          createdAt: dr.created_at ?? "",
          resolvedAt: dr.resolved_at,
          maintenanceEventUuid: dr.maintenance_event_uuid,
          workTrackerDate: linkedWt?.date ?? null,
        };
      });

      // Subrental events — split by status
      const relatedSRs = srsByBleacher.get(b.id) ?? [];
      // Only pending SRs become visible spans on the grid
      const subrentalEvents = relatedSRs
        .filter((sr) => (sr.status ?? "pending") === "pending")
        .map((sr) => ({
          subrentalEventUuid: sr.id,
          eventStart: sr.event_start ?? "",
          eventEnd: sr.event_end ?? "",
          status: sr.status ?? "pending",
          requestedZoneUuid: sr.requested_zone_uuid ?? null,
          notes: sr.notes ?? null,
        }));
      // Accepted SRs become blocked date ranges on this (original) row
      const acceptedSubrentalBlocks = relatedSRs
        .filter((sr) => sr.status === "accepted")
        .map((sr) => ({ eventStart: sr.event_start ?? "", eventEnd: sr.event_end ?? "" }));

      const isAccessible =
        isAdmin ||
        (isAccountManager && !!b.zone_uuid && accountManagerZoneIds.includes(b.zone_uuid));

      return {
        bleacherUuid: b.id,
        bleacherNumber: b.bleacher_number ?? 0,
        bleacherRows: b.bleacher_rows ?? 0,
        bleacherSeats: b.bleacher_seats ?? 0,
        linxupDeviceId: b.linxup_device_id,
        summerAccountManagerUuid: b.summer_account_manager_uuid,
        winterAccountManagerUuid: b.winter_account_manager_uuid,
        zoneUuid: b.zone_uuid ?? null,
        zoneName: b.zone_uuid ? (zoneMap.get(b.zone_uuid) ?? null) : null,
        storageLocationName: b.storage_location_uuid
          ? (storageLocationMap.get(b.storage_location_uuid) ?? null)
          : null,
        originalZoneName: null,
        summerHomeBase,
        winterHomeBase,
        bleacherEvents,
        blocks,
        workTrackers,
        maintenanceEvents,
        subrentalEvents,
        damageReports,
        isAccessible,
        acceptedSubrentalBlocks,
      };
    });

    // Build a lookup from bleacherId → assembled normal row so subrental rows can copy its data.
    const normalRowByBleacherId = new Map(normalRows.map((r) => [r.bleacherUuid, r]));

    // ── Subrental rows: one virtual row per bleacher per borrowing zone ──────
    const subrentalRows: Bleacher[] = [];
    for (const b of allBleacherRows) {
      const relatedSRs = srsByBleacher.get(b.id) ?? [];
      if (!relatedSRs.length) continue;

      // Group by requestedZoneUuid, skipping subrental events targeting the bleacher's own zone
      const srsByZone = new Map<string, typeof relatedSRs>();
      for (const sr of relatedSRs) {
        const zoneId = sr.requested_zone_uuid;
        if (!zoneId || zoneId === b.zone_uuid) continue;
        const arr = srsByZone.get(zoneId);
        if (arr) arr.push(sr);
        else srsByZone.set(zoneId, [sr]);
      }

      for (const [targetZoneUuid, zoneSRs] of srsByZone) {
        const subrentalRowEvents = zoneSRs
          .filter((sr) => (sr.status ?? "pending") === "pending")
          .map((sr) => ({
            subrentalEventUuid: sr.id,
            eventStart: sr.event_start ?? "",
            eventEnd: sr.event_end ?? "",
            status: sr.status ?? "pending",
            requestedZoneUuid: sr.requested_zone_uuid ?? null,
            notes: sr.notes ?? null,
          }));
        // Accepted SRs become the accessible date ranges on this subrental row
        const acceptedSubrentalAccess = zoneSRs
          .filter((sr) => sr.status === "accepted")
          .map((sr) => ({ eventStart: sr.event_start ?? "", eventEnd: sr.event_end ?? "" }));

        const subrentalRowIsAccessible =
          isAdmin || (isAccountManager && accountManagerZoneIds.includes(targetZoneUuid));

        const subrentalRowSummerHomeBase = b.summer_home_base_uuid
          ? {
              homeBaseUuid: b.summer_home_base_uuid,
              name: homeBaseMap.get(b.summer_home_base_uuid) ?? "",
            }
          : null;
        const subrentalRowWinterHomeBase = b.winter_home_base_uuid
          ? {
              homeBaseUuid: b.winter_home_base_uuid,
              name: homeBaseMap.get(b.winter_home_base_uuid) ?? "",
            }
          : null;

        subrentalRows.push({
          bleacherUuid: b.id,
          bleacherNumber: b.bleacher_number ?? 0,
          bleacherRows: b.bleacher_rows ?? 0,
          bleacherSeats: b.bleacher_seats ?? 0,
          linxupDeviceId: b.linxup_device_id,
          summerAccountManagerUuid: b.summer_account_manager_uuid,
          winterAccountManagerUuid: b.winter_account_manager_uuid,
          zoneUuid: targetZoneUuid,
          zoneName: zoneMap.get(targetZoneUuid) ?? null,
          storageLocationName: b.storage_location_uuid
            ? (storageLocationMap.get(b.storage_location_uuid) ?? null)
            : null,
          originalZoneName: b.zone_uuid ? (zoneMap.get(b.zone_uuid) ?? null) : null,
          summerHomeBase: subrentalRowSummerHomeBase,
          winterHomeBase: subrentalRowWinterHomeBase,
          // Copy all data from the normal row so the subrental row shows the same events,
          // blocks, work trackers, maintenance events and damage reports
          bleacherEvents: normalRowByBleacherId.get(b.id)?.bleacherEvents ?? [],
          blocks: normalRowByBleacherId.get(b.id)?.blocks ?? [],
          workTrackers: normalRowByBleacherId.get(b.id)?.workTrackers ?? [],
          maintenanceEvents: normalRowByBleacherId.get(b.id)?.maintenanceEvents ?? [],
          damageReports: normalRowByBleacherId.get(b.id)?.damageReports ?? [],
          subrentalEvents: subrentalRowEvents,
          isAccessible: subrentalRowIsAccessible,
          isSubrentalRow: true,
          acceptedSubrentalAccess,
        });
      }
    }

    const allRows = [...normalRows, ...subrentalRows];
    allRows.sort((a, b) => a.bleacherNumber - b.bleacherNumber);
    return allRows;
  }, [
    allBleacherRows,
    homeBaseMap,
    zoneMap,
    storageLocationMap,
    bleacherEventRows,
    eventMap,
    addressMap,
    blockRows,
    workTrackerRows,
    driverUserMap,
    bleacherMaintEventRows,
    maintEventMap,
    subrentalEventRows,
    damageReportRows,
    isAdmin,
    isAccountManager,
    accountManagerZoneIds,
  ]);

  // ── Assemble DashboardEvent[] ────────────────────────────────────────
  const events: DashboardEvent[] = useMemo(() => {
    let filtered = eventRows;
    if (opts?.onlyShowMyEvents && currentUserUuid) {
      filtered = eventRows.filter((e) => e.created_by_user_uuid === currentUserUuid);
    }

    return filtered.map((e) => {
      const addr = e.address_uuid ? addressMap.get(e.address_uuid) : undefined;
      const eventBleacherUuids = bleacherEventRows
        .filter((be) => be.event_uuid === e.id && be.bleacher_uuid)
        .map((be) => be.bleacher_uuid!);

      return {
        eventUuid: e.id,
        bleacherEventUuid: "-1",
        eventName: e.event_name ?? "",
        addressData: addr
          ? {
              addressUuid: e.address_uuid!,
              address: addr.street,
              city: addr.city,
              state: addr.state_province,
              postalCode: addr.zip_postal ?? undefined,
            }
          : null,
        seats: e.total_seats,
        sevenRow: e.seven_row,
        tenRow: e.ten_row,
        fifteenRow: e.fifteen_row,
        bleacherRequirements: [],
        setupStart: e.setup_start ?? "",
        setupText: null,
        setupConfirmed: false,
        sameDaySetup: !e.setup_start,
        eventStart: e.event_start ?? "",
        eventEnd: e.event_end ?? "",
        teardownEnd: e.teardown_end ?? "",
        teardownText: null,
        teardownConfirmed: false,
        sameDayTeardown: !e.teardown_end,
        lenient: toBool(e.lenient),
        token: "",
        selectedStatus: (e.event_status ?? "quoted") as DashboardEvent["selectedStatus"],
        notes: e.notes ?? "",
        numDays: 0,
        status: (e.event_status ?? "quoted") as DashboardEvent["status"],
        hslHue: e.hsl_hue,
        alerts: [],
        mustBeClean: toBool(e.must_be_clean),
        bleacherUuids: eventBleacherUuids,
        goodshuffleUrl: e.goodshuffle_url ?? null,
        ownerUserUuid: e.created_by_user_uuid ?? null,
      };
    });
  }, [eventRows, addressMap, bleacherEventRows, opts?.onlyShowMyEvents, currentUserUuid]);

  // ── Push into zustand stores so PixiJS reacts ────────────────────────
  useEffect(() => {
    useDashboardBleachersStore.getState().setData(bleachers);
    useDashboardBleachersStore.getState().setStale(false);
  }, [bleachers]);

  useEffect(() => {
    useDashboardEventsStore.getState().setData(events);
    useDashboardEventsStore.getState().setStale(false);
  }, [events]);

  return { bleachers, events };
}
