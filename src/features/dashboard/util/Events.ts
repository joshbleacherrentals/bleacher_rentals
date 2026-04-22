import { DateTime } from "luxon";
import { Bleacher, BleacherEvent } from "../types";
import { CELL_HEIGHT } from "../values/constants";

export type EventSpanType = {
  start: number;
  end: number;
  ev: BleacherEvent;
  rowIndex: number;
};

export type EventInfo = {
  hasEvent: boolean;
  span?: EventSpanType;
  isStart: boolean;
  isEnd: boolean;
  isMiddle: boolean;
};

export type OverlapInfo = {
  topOffset: number;
  height: number;
  zIndex: number;
};

export type CellEventInfoWithOverlap = EventInfo & {
  overlapInfo: OverlapInfo;
};

export class EventsUtil {
  /**
   * Check if there's a pinned event for this row
   * Returns true if there's an event that should be pinned (convenience method)
   */
  // public static hasPinnedEventForRow(
  //   row: number,
  //   firstVisibleColumn: number,
  //   spansByRow: EventSpanType[][]
  // ): boolean {
  //   for (const span of spansByRow[row]) {
  //     // We want events that:
  //     // 1. Started strictly before the first visible column (scrolled off-screen to the left)
  //     // 2. End at or after the first visible column (still spanning into visible area)
  //     if (span.start <= firstVisibleColumn && span.end >= firstVisibleColumn) {
  //       return true;
  //     }
  //   }
  //   return false;
  // }

  /**
   * Check if a specific event span should be pinned based on scroll position
   * Returns true if THIS specific event should have a pinned label
   */
  public static shouldEventBePinned(eventSpan: EventSpanType, firstVisibleColumn: number): boolean {
    // Event should be pinned if it started before the first visible column
    // but still spans into the visible area
    return eventSpan.start <= firstVisibleColumn && eventSpan.end >= firstVisibleColumn;
  }

  /**
   * Find the event span that should be pinned for a given row
   * Returns the event that started before the first visible column but still spans into view
   */
  public static findPinnedEventSpan(
    row: number,
    firstVisibleColumn: number,
    spansByRow: EventSpanType[][],
  ): EventSpanType | null {
    const spans = spansByRow[row] ?? [];

    for (const span of spans) {
      if (this.shouldEventBePinned(span, firstVisibleColumn)) {
        return span;
      }
    }

    return null;
  }

  /**
   * Calculate event spans from bleacher data and date range
   * Converts event dates to column indices for grid rendering
   */
  public static calculateEventSpans(
    bleachers: Bleacher[],
    dates: string[],
    opts?: {
      // Optional injection of a currently selected event to preview across selected bleachers
      selected?: {
        eventUuid?: string | null;
        bleacherUuids: string[];
        eventStart: string;
        eventEnd: string;
        eventName?: string;
        address?: string;
        hslHue?: number | null;
        selectedStatus?: string;
        goodshuffleUrl?: string | null;
      } | null;
      // Optional injection of a currently selected maintenance event to preview
      selectedMaintenance?: {
        maintenanceEventUuid?: string | null;
        bleacherUuids: string[];
        eventStart: string;
        eventEnd: string;
        eventName?: string;
        address?: string;
      } | null;
    },
  ): { spansByRow: EventSpanType[][]; dateToIndex: Map<string, number> } {
    const dateToIndex = new Map(dates.map((d, i) => [d, i]));
    const selected = opts?.selected;
    const selectedStartISO = selected?.eventStart
      ? DateTime.fromISO(selected.eventStart).toISODate()
      : null;
    const selectedEndISO = selected?.eventEnd
      ? DateTime.fromISO(selected.eventEnd).toISODate()
      : null;
    const selectedStartCol =
      selectedStartISO != null ? dateToIndex.get(selectedStartISO) : undefined;
    const selectedEndCol = selectedEndISO != null ? dateToIndex.get(selectedEndISO) : undefined;

    const selMaint = opts?.selectedMaintenance;
    const selMaintStartISO = selMaint?.eventStart
      ? DateTime.fromISO(selMaint.eventStart).toISODate()
      : null;
    const selMaintEndISO = selMaint?.eventEnd
      ? DateTime.fromISO(selMaint.eventEnd).toISODate()
      : null;
    const selMaintStartCol =
      selMaintStartISO != null ? dateToIndex.get(selMaintStartISO) : undefined;
    const selMaintEndCol = selMaintEndISO != null ? dateToIndex.get(selMaintEndISO) : undefined;

    const spansByRow = bleachers.map((bleacher, rowIndex) => {
      const spans: EventSpanType[] = [];

      // Check for unresolved damage reports on this bleacher
      const unresolvedDamage = (bleacher.damageReports ?? []).filter((r) => !r.resolvedAt);
      const hasDamage = unresolvedDamage.length > 0;

      for (const ev of bleacher.bleacherEvents ?? []) {
        // If editing an existing event, exclude persisted spans for that eventUuid
        if (selected?.eventUuid != null && ev.eventUuid === selected.eventUuid) {
          continue;
        }
        // Convert dates to indices
        const startISO = DateTime.fromISO(ev.eventStart).toISODate();
        const endISO = DateTime.fromISO(ev.eventEnd).toISODate();

        // Skip if dates are invalid
        if (!startISO || !endISO) continue;

        const startCol = dateToIndex.get(startISO);
        const endCol = dateToIndex.get(endISO);

        // Only include events that fall within our date range
        if (startCol !== undefined && endCol !== undefined) {
          // If we have a current selection and this bleacher is selected, filter out any
          // original event that exactly matches the selected event's date range.
          // This avoids double-rendering when previewing the same event before save.
          const isSelectedBleacher = !!selected?.bleacherUuids?.includes(bleacher.bleacherUuid);
          const matchesSelectedRange =
            isSelectedBleacher &&
            selectedStartCol !== undefined &&
            selectedEndCol !== undefined &&
            startCol === selectedStartCol &&
            endCol === selectedEndCol;
          if (matchesSelectedRange) {
            // skip this original span; it will be injected below as selected
            continue;
          }
          spans.push({
            start: startCol,
            end: endCol,
            ev: hasDamage ? { ...ev, hasDamageAlert: true } : ev,
            rowIndex,
          });
        }
      }

      // Add maintenance events as spans
      for (const me of bleacher.maintenanceEvents ?? []) {
        // If editing an existing maintenance event, exclude its persisted spans
        if (
          selMaint?.maintenanceEventUuid != null &&
          me.maintenanceEventUuid === selMaint.maintenanceEventUuid
        ) {
          continue;
        }
        const startISO = DateTime.fromISO(me.eventStart).toISODate();
        const endISO = DateTime.fromISO(me.eventEnd).toISODate();
        if (!startISO || !endISO) continue;
        const startCol = dateToIndex.get(startISO);
        const endCol = dateToIndex.get(endISO);
        if (startCol !== undefined && endCol !== undefined) {
          spans.push({
            start: startCol,
            end: endCol,
            ev: {
              eventUuid: me.maintenanceEventUuid,
              bleacherEventUuid: me.bleacherMaintEventUuid,
              eventName: me.eventName,
              address: me.address,
              eventStart: me.eventStart,
              eventEnd: me.eventEnd,
              hslHue: null,
              booked: true,
              goodshuffleUrl: null,
              isMaintenance: true,
            },
            rowIndex,
          });
        }
      }

      // Inject a synthetic selected event span for preview if this bleacher is selected
      if (
        selected &&
        Array.isArray(selected.bleacherUuids) &&
        selected.bleacherUuids.includes(bleacher.bleacherUuid) &&
        selectedStartCol !== undefined &&
        selectedEndCol !== undefined
      ) {
        const ev = {
          eventUuid: selected.eventUuid ?? "-1",
          bleacherEventUuid: "-1",
          eventName: selected.eventName || "New Event",
          address: selected.address || "No address",
          eventStart: selected.eventStart,
          eventEnd: selected.eventEnd,
          hslHue: selected.hslHue ?? 220,
          booked: (selected.selectedStatus ?? "quoted") === "booked",
          goodshuffleUrl: selected.goodshuffleUrl ?? null,
          isSelected: true,
        } as any; // BleacherEvent compatible
        spans.push({ start: selectedStartCol, end: selectedEndCol, ev, rowIndex });
      }

      // Inject a synthetic maintenance preview span
      if (
        selMaint &&
        Array.isArray(selMaint.bleacherUuids) &&
        selMaint.bleacherUuids.includes(bleacher.bleacherUuid) &&
        selMaintStartCol !== undefined &&
        selMaintEndCol !== undefined
      ) {
        const ev = {
          eventUuid: selMaint.maintenanceEventUuid ?? "-1",
          bleacherEventUuid: "-1",
          eventName: selMaint.eventName || "Maintenance / Repair",
          address: selMaint.address || "",
          eventStart: selMaint.eventStart,
          eventEnd: selMaint.eventEnd,
          hslHue: null,
          booked: true,
          goodshuffleUrl: null,
          isMaintenance: true,
          isSelected: true,
        } as any;
        spans.push({ start: selMaintStartCol, end: selMaintEndCol, ev, rowIndex });
      }

      // Sort spans by start column for consistent rendering
      spans.sort((a, b) => a.start - b.start);
      return spans;
    });

    return { spansByRow, dateToIndex };
  }

  /**
   * Check if a specific cell (row, col) has an event and return event details
   * Properly determines if this cell is the start, middle, or end of an event span
   */
  public static getCellEventInfo(
    row: number,
    col: number,
    spansByRow: EventSpanType[][],
  ): EventInfo {
    const spans = spansByRow[row] ?? [];
    let log = false;
    if (row === 6 && [986, 987, 988, 995, 996, 997].includes(col)) {
      log = true;
      // console.log("89 Row 6, col", col);
    }

    // Find the span that contains this column
    // NOTE: If multiple events overlap the same cell, we take the first one
    for (const span of spans) {
      if (col > span.start && col < span.end) {
        // if (log)
        // console.log("89 Row 6, col ", col, {
        //   hasEvent: true,
        //   span: span,
        //   isStart: false,
        //   isEnd: false,
        //   isMiddle: true,
        // });
        return {
          hasEvent: true,
          span: span,
          isStart: false,
          isEnd: false,
          isMiddle: true,
        };
      } else if (col === span.start) {
        // if (log)
        // console.log("89 Row 6, col ", col, {
        //   hasEvent: true,
        //   span: span,
        //   isStart: true,
        //   isEnd: false,
        //   isMiddle: false,
        // });
        return {
          hasEvent: true,
          span: span,
          isStart: true,
          isEnd: false,
          isMiddle: false,
        };
      } else if (col === span.end) {
        // if (log)
        // console.log("89 Row 6, col ", col, {
        //   hasEvent: true,
        //   span: span,
        //   isStart: false,
        //   isEnd: true,
        //   isMiddle: false,
        // });
        return {
          hasEvent: true,
          span: span,
          isStart: false,
          isEnd: true,
          isMiddle: false,
        };
      }
    }

    // No event found for this cell
    // if (log)
    //   console.log("89 Row 6, col ", col, {
    //     hasEvent: false,
    //     isStart: false,
    //     isEnd: false,
    //     isMiddle: false,
    //   });
    return {
      hasEvent: false,
      isStart: false,
      isEnd: false,
      isMiddle: false,
    };
  }

  /**
   * Get all events at a cell with overlap rendering info.
   * Returns an array of event infos with computed topOffset and zIndex.
   * Events are ordered by depth (earliest start = lowest depth = tallest).
   */
  public static getAllCellEventInfos(
    row: number,
    col: number,
    spansByRow: EventSpanType[][],
  ): CellEventInfoWithOverlap[] {
    const spans = spansByRow[row] ?? [];
    if (spans.length === 0) return [];

    const matchingSpans = spans.filter((s) => col >= s.start && col <= s.end);
    if (matchingSpans.length === 0) return [];

    // Fast path: single span in entire row = no overlaps possible
    if (spans.length === 1) {
      const span = matchingSpans[0];
      return [
        {
          hasEvent: true,
          span,
          isStart: col === span.start,
          isEnd: col === span.end,
          isMiddle: col > span.start && col < span.end,
          overlapInfo: { topOffset: 0, height: CELL_HEIGHT, zIndex: 1 },
        },
      ];
    }

    const depthInfo = this.computeSpanDepths(spans);

    return matchingSpans.map((span) => {
      const info = depthInfo.get(span)!;
      const eventHeight = CELL_HEIGHT / info.totalLevels;
      const topOffset = info.totalLevels > 1 ? info.depth * eventHeight : 0;
      return {
        hasEvent: true,
        span,
        isStart: col === span.start,
        isEnd: col === span.end,
        isMiddle: col > span.start && col < span.end,
        overlapInfo: {
          topOffset,
          height: info.totalLevels > 1 ? eventHeight : CELL_HEIGHT,
          zIndex: info.depth + 1,
        },
      };
    });
  }

  /**
   * Compute overlap depth for each span in a row.
   * Depth = max(depth of overlapping earlier spans) + 1.
   * Connected components get independent totalLevels.
   */
  private static computeSpanDepths(
    spans: EventSpanType[],
  ): Map<EventSpanType, { depth: number; totalLevels: number }> {
    if (spans.length === 0) return new Map();

    // Sort: earliest start first, longest span first at same start
    const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end);

    // 1. Compute depth for each span
    const depths: number[] = [];
    for (let i = 0; i < sorted.length; i++) {
      let maxPriorDepth = -1;
      for (let j = 0; j < i; j++) {
        if (sorted[j].end >= sorted[i].start) {
          if (depths[j] > maxPriorDepth) maxPriorDepth = depths[j];
        }
      }
      depths[i] = maxPriorDepth + 1;
    }

    // 2. Union-Find for connected components
    const parent = sorted.map((_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) {
        parent[x] = parent[parent[x]];
        x = parent[x];
      }
      return x;
    };

    for (let i = 0; i < sorted.length; i++) {
      for (let j = i + 1; j < sorted.length; j++) {
        if (sorted[i].end >= sorted[j].start) {
          const ri = find(i),
            rj = find(j);
          if (ri !== rj) parent[ri] = rj;
        }
      }
    }

    // 3. Max depth per component
    const componentMaxDepth = new Map<number, number>();
    for (let i = 0; i < sorted.length; i++) {
      const root = find(i);
      componentMaxDepth.set(root, Math.max(componentMaxDepth.get(root) ?? 0, depths[i]));
    }

    // 4. Build result
    const result = new Map<EventSpanType, { depth: number; totalLevels: number }>();
    for (let i = 0; i < sorted.length; i++) {
      const root = find(i);
      result.set(sorted[i], {
        depth: depths[i],
        totalLevels: (componentMaxDepth.get(root) ?? 0) + 1,
      });
    }

    return result;
  }

  /**
   * Convert HSL (0–360, 0–100, 0–100) to 0xRRGGBB int for sprite.tint
   */
  public static hslToRgbInt(h: number, s: number, l: number): number {
    const S = s / 100,
      L = l / 100;
    const C = (1 - Math.abs(2 * L - 1)) * S;
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = L - C / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) [r, g, b] = [C, X, 0];
    else if (h < 120) [r, g, b] = [X, C, 0];
    else if (h < 180) [r, g, b] = [0, C, X];
    else if (h < 240) [r, g, b] = [0, X, C];
    else if (h < 300) [r, g, b] = [X, 0, C];
    else [r, g, b] = [C, 0, X];
    const R = Math.round((r + m) * 255);
    const G = Math.round((g + m) * 255);
    const B = Math.round((b + m) * 255);
    return (R << 16) | (G << 8) | B;
  }
}
