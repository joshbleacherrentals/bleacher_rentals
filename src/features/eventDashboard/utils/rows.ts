import type { Bleacher } from "@/features/dashboard/types";
import type { EventLogisticsCheck } from "@/features/scheduleValidator/utils/logisticsPlan";
import { formatDateRange } from "@/features/scheduleValidator/utils/formatDateRange";
import { buildDeliveryList } from "@/features/autoWorkTrackers/utils/deliveryList";

/**
 * The rows of the Event Dashboard: for each event starting in the week, a header row (the event's
 * name and where it stands) followed by a row for each bleacher assigned to it. A bleacher on
 * several events gets a row under each. Pure.
 */

export type EventHeaderRow = {
  kind: "header";
  key: string;
  eventId: string;
  title: string;
  /** "Nov 13 · 9 Here St" */
  detail: string;
  /** "2 of 5 to deliver", "Ready" or "No bleachers assigned". */
  status: string;
  ready: boolean;
};

export type BleacherGridRow = {
  kind: "bleacher";
  key: string;
  eventId: string;
  bleacher: Bleacher;
  /** Already at the event's street by its start: nothing to deliver. */
  ready: boolean;
};

export type GridRow = EventHeaderRow | BleacherGridRow;

const HEADER_UUID_PREFIX = "header:";

export function isHeaderBleacher(bleacher: Bleacher): boolean {
  return bleacher.bleacherUuid.startsWith(HEADER_UUID_PREFIX);
}

function statusOf(total: number, toDeliver: number): string {
  if (total === 0) return "No bleachers assigned";
  return toDeliver === 0 ? "Ready" : `${toDeliver} of ${total} to deliver`;
}

/** The dashboard's own bleacher for each uuid; the bleacher's home row, never a subrental ghost row. */
function indexBleachers(bleachers: Bleacher[]): Map<string, Bleacher> {
  const byUuid = new Map<string, Bleacher>();
  for (const b of bleachers) {
    const known = byUuid.get(b.bleacherUuid);
    if (!known || (known.isSubrentalRow && !b.isSubrentalRow)) byUuid.set(b.bleacherUuid, b);
  }
  return byUuid;
}

/**
 * Events with bleachers still to deliver come first, then the ready ones; within an event the
 * bleachers to deliver come first. A bleacher the dashboard does not know (say, one this user may
 * not see) is left out.
 */
export function buildGridRows(events: EventLogisticsCheck[], bleachers: Bleacher[]): GridRow[] {
  const byUuid = indexBleachers(bleachers);
  const rows: GridRow[] = [];

  for (const event of buildDeliveryList(events)) {
    rows.push({
      kind: "header",
      key: `${HEADER_UUID_PREFIX}${event.eventId}`,
      eventId: event.eventId,
      title: event.eventName,
      detail: `${formatDateRange(event.startDate, event.startDate)} · ${event.street ?? "No address"}`,
      status: statusOf(event.bleachers.length, event.toDeliver),
      ready: event.allReady,
    });
    for (const delivery of event.bleachers) {
      const bleacher = byUuid.get(delivery.bleacherUuid);
      if (!bleacher) continue;
      rows.push({
        kind: "bleacher",
        key: `${event.eventId}:${delivery.bleacherUuid}`,
        eventId: event.eventId,
        bleacher,
        ready: delivery.ready,
      });
    }
  }
  return rows;
}

/** An empty stand-in for an event header, so the dashboard's renderers can index it like any row. */
function headerBleacher(row: EventHeaderRow): Bleacher {
  return {
    bleacherUuid: row.key,
    bleacherNumber: 0,
    bleacherRows: 0,
    bleacherSeats: 0,
    summerHomeBase: null,
    winterHomeBase: null,
    bleacherEvents: [],
    blocks: [],
    workTrackers: [],
    maintenanceEvents: [],
    subrentalEvents: [],
    damageReports: [],
    linxupDeviceId: null,
    summerAccountManagerUuid: null,
    winterAccountManagerUuid: null,
    zoneUuid: null,
    zoneName: null,
    storageLocationName: null,
    isAccessible: true,
  };
}

/** The rows as the dashboard's `Bleacher[]`: a header row becomes an empty bleacher. */
export function toDashboardRows(rows: GridRow[]): Bleacher[] {
  return rows.map((row) => (row.kind === "header" ? headerBleacher(row) : row.bleacher));
}
