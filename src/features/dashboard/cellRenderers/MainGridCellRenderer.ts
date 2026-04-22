import { Application, Container, Text } from "pixi.js";
import { ICellRenderer } from "../interfaces/ICellRenderer";
import { Baker } from "../util/Baker";
import { EventBody } from "../ui/event/EventBody";
import { EventSpanType, EventsUtil } from "../util/Events";
import { Tile, DamageSeverity } from "../ui/Tile";
import { FirstCellNotPinned } from "../ui/event/FirstCellNotPinned";
import { PinnableSection } from "../ui/event/PinnableSection";
import { CELL_WIDTH } from "../values/constants";
import { CellEditor } from "../util/CellEditor";
import { Graphics, Sprite } from "pixi.js";
import { WorkTrackerGroup } from "../ui/event/worktracker/WorkTrackerGroup";
import { DateTime } from "luxon";
import { Bleacher, DashboardEvent } from "../types";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { useSelectedBlockStore } from "../state/useSelectedBlock";
import { useWorkTrackerSelectionStore } from "@/features/workTrackers/state/useWorkTrackerSelectionStore";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";

/** Column range where the damage overlay should be drawn */
type DamageOverlayRange = { startCol: number; endCol: number; severity: DamageSeverity };

/**
 * CellRenderer for the main scrollable grid area
 * Renders cells with event spans when events are present
 *
 * This renderer BUILDS cell content by composing UI components from src/features/dashboard/ui/
 * The Grid handles automatic baking and caching for performance
 */
export class MainGridCellRenderer implements ICellRenderer {
  private app: Application;
  private baker: Baker;
  private spansByRow: EventSpanType[][];
  private bleachers: Bleacher[];
  private events?: DashboardEvent[];
  private dates: string[];
  private currentScrollX: number = 0;
  private cellWidth: number = 0; // Store the cell width from main grid
  private cellEditor?: CellEditor; // Cell editor instance
  private yAxis: "Bleachers" | "Events" = "Bleachers";
  private visibleCells: Map<
    string,
    { parent: Container; w: number; h: number; firstVisibleColumn?: number }
  > = new Map();
  private unsubBleachers?: () => void;
  // Maintain a stable mapping from row index -> bleacherId (from initial input)
  private rowBleacherUuids: string[];
  // Always-up-to-date bleacher snapshot from the store, keyed by id
  private latestBleachersByUuid: Map<string, Bleacher>;
  // Pre-computed damage overlay column ranges per row
  private damageOverlaysByRow: Map<number, DamageOverlayRange[]> = new Map();

  // No external callback; selection is pushed to a zustand store

  constructor(
    app: Application,
    bleachers: Bleacher[],
    events: DashboardEvent[],
    dates: string[],
    yAxis: "Bleachers" | "Events",
    opts?: undefined,
  ) {
    this.app = app;
    this.baker = new Baker(app);
    this.bleachers = bleachers;
    this.events = events;
    this.dates = dates;
    this.yAxis = yAxis;
    // Stable mapping for rows
    this.rowBleacherUuids = bleachers.map((b) => b.bleacherUuid);
    this.latestBleachersByUuid = new Map(bleachers.map((b) => [b.bleacherUuid, b] as const));

    // Calculate event spans once during construction depending on yAxis
    if (yAxis === "Bleachers") {
      const sel = useCurrentEventStore.getState();
      const selected =
        sel.eventStart && sel.eventEnd
          ? {
              eventUuid: sel.eventUuid ?? null,
              bleacherUuids: sel.bleacherUuids ?? [],
              eventStart: sel.eventStart,
              eventEnd: sel.eventEnd,
              eventName: sel.eventName || undefined,
              address: sel.addressData?.address || undefined,
              hslHue: sel.hslHue ?? undefined,
              selectedStatus: sel.selectedStatus,
              goodshuffleUrl: sel.goodshuffleUrl ?? null,
            }
          : undefined;
      const mt = useMaintenanceEventStore.getState();
      const selectedMaintenance =
        mt.isFormExpanded && mt.eventStart && mt.eventEnd
          ? {
              maintenanceEventUuid: mt.maintenanceEventUuid ?? null,
              bleacherUuids: mt.bleacherUuids ?? [],
              eventStart: mt.eventStart,
              eventEnd: mt.eventEnd,
              eventName: mt.eventName || undefined,
              address: mt.addressData?.address || undefined,
            }
          : undefined;
      const { spansByRow } = EventsUtil.calculateEventSpans(bleachers, dates, {
        selected,
        selectedMaintenance,
      });
      this.spansByRow = spansByRow;
    } else {
      this.spansByRow = this.calculateSpansByEvents(events, dates);
    }

    // Compute damage overlay ranges
    if (yAxis === "Bleachers") {
      this.damageOverlaysByRow = this.computeDamageOverlays(bleachers, dates);
    }

    // Subscribe to dashboard bleachers store to update block text dynamically
    try {
      let prevData = useDashboardBleachersStore.getState().data;
      this.unsubBleachers = useDashboardBleachersStore.subscribe((s) => {
        const nextData = s.data;
        if (this.yAxis !== "Bleachers") {
          prevData = nextData;
          return;
        }

        // Map current ROW -> bleacherId to row indices (stable, based on initial input)
        const uuidToRow = new Map<string, number>();
        this.rowBleacherUuids.forEach((id, i) => uuidToRow.set(id, i));
        const prevByUuid = new Map(prevData.map((b) => [b.bleacherUuid, b] as const));

        // For each bleacher present in next data, compare block texts by date
        for (const nextBleacher of nextData) {
          const rowIndex = uuidToRow.get(nextBleacher.bleacherUuid);
          if (rowIndex === undefined) continue;
          const prevBleacher = prevByUuid.get(nextBleacher.bleacherUuid);
          const prevBlocksByDate = new Map(
            (prevBleacher?.blocks ?? []).map((bl) => [bl.date, bl.text] as const),
          );
          const nextBlocksByDate = new Map(
            (nextBleacher.blocks ?? []).map((bl) => [bl.date, bl.text] as const),
          );
          const allDates = new Set<string>([
            ...Array.from(prevBlocksByDate.keys()),
            ...Array.from(nextBlocksByDate.keys()),
          ]);

          for (const d of allDates) {
            const prevText = prevBlocksByDate.get(d) ?? "";
            const nextText = nextBlocksByDate.get(d) ?? "";
            if (prevText !== nextText) {
              const colIndex = this.dates.indexOf(d);
              if (colIndex !== -1) {
                const key = `${rowIndex}:${colIndex}`;
                const vis = this.visibleCells.get(key);
                // Update latest snapshot map so rebuild uses current data
                this.latestBleachersByUuid = new Map(
                  nextData.map((b) => [b.bleacherUuid, b] as const),
                );
                if (vis) {
                  // Rebuild just this visible cell to refresh its baked text
                  this.buildCell(
                    rowIndex,
                    colIndex,
                    vis.w,
                    vis.h,
                    vis.parent,
                    vis.firstVisibleColumn,
                  );
                }
              }
            }
          }
        }

        // Keep snapshot in sync
        prevData = nextData;
        this.latestBleachersByUuid = new Map(nextData.map((b) => [b.bleacherUuid, b] as const));
      });
    } catch {}
  }

  /**
   * Update underlying data and recompute spans without recreating the renderer
   * Call Grid.forceUpdate() after this to refresh visible cells.
   */
  public setData(bleachers: Bleacher[], events: DashboardEvent[], yAxis: "Bleachers" | "Events") {
    console.log("setData MainScrollableGridCellRenderer");
    this.baker.destroyAll();
    this.bleachers = bleachers;
    this.events = events;
    this.yAxis = yAxis;
    this.rowBleacherUuids = bleachers.map((b) => b.bleacherUuid);
    this.latestBleachersByUuid = new Map(bleachers.map((b) => [b.bleacherUuid, b] as const));

    if (yAxis === "Bleachers") {
      const sel = useCurrentEventStore.getState();
      const selected =
        sel.eventStart && sel.eventEnd
          ? {
              eventUuid: sel.eventUuid ?? null,
              bleacherUuids: sel.bleacherUuids ?? [],
              eventStart: sel.eventStart,
              eventEnd: sel.eventEnd,
              eventName: sel.eventName || undefined,
              address: sel.addressData?.address || undefined,
              hslHue: sel.hslHue ?? undefined,
              selectedStatus: sel.selectedStatus,
              goodshuffleUrl: sel.goodshuffleUrl ?? null,
            }
          : undefined;
      const mt = useMaintenanceEventStore.getState();
      const selectedMaintenance =
        mt.isFormExpanded && mt.eventStart && mt.eventEnd
          ? {
              maintenanceEventUuid: mt.maintenanceEventUuid ?? null,
              bleacherUuids: mt.bleacherUuids ?? [],
              eventStart: mt.eventStart,
              eventEnd: mt.eventEnd,
              eventName: mt.eventName || undefined,
              address: mt.addressData?.address || undefined,
            }
          : undefined;
      const { spansByRow } = EventsUtil.calculateEventSpans(bleachers, this.dates, {
        selected,
        selectedMaintenance,
      });
      this.spansByRow = spansByRow;
    } else {
      this.spansByRow = this.calculateSpansByEvents(events, this.dates);
    }

    // Recompute damage overlays
    if (yAxis === "Bleachers") {
      this.damageOverlaysByRow = this.computeDamageOverlays(bleachers, this.dates);
    } else {
      this.damageOverlaysByRow.clear();
    }
  }

  /**
   * When yAxis = "Events", build spans per event row using DashboardEvent
   */
  private calculateSpansByEvents(events: DashboardEvent[], dates: string[]): EventSpanType[][] {
    const dateToIndex = new Map(dates.map((d, i) => [d, i]));
    return events.map((ev, rowIndex) => {
      const spans: EventSpanType[] = [];
      const startISO = DateTime.fromISO(ev.eventStart).toISODate();
      const endISO = DateTime.fromISO(ev.eventEnd).toISODate();
      if (!startISO || !endISO) return spans;
      const startCol = dateToIndex.get(startISO);
      const endCol = dateToIndex.get(endISO);
      if (startCol === undefined || endCol === undefined) return spans;

      // // Skip LOST events - don't render them at all
      // if (ev.selectedStatus === "LOST") return spans;

      // Map DashboardEvent to BleacherEvent-like object (only needed fields)
      const be = {
        eventUuid: ev.eventUuid,
        bleacherEventUuid: ev.bleacherEventUuid ?? "-1",
        eventName: ev.eventName,
        address: ev.addressData?.address ?? "",
        eventStart: ev.eventStart,
        eventEnd: ev.eventEnd,
        hslHue: ev.hslHue ?? null,
        contract_status: ev.selectedStatus,
        goodshuffleUrl: ev.goodshuffleUrl ?? null,
      } as any; // compatible with BleacherEvent used by EventBody

      spans.push({ start: startCol, end: endCol, ev: be, rowIndex });
      return spans;
    });
  }

  /**
   * Compute damage overlay column ranges for each bleacher row.
   *
   * For each unresolved damage report where the bleacher is NOT safe:
   * - Overlay starts the day AFTER the associated work tracker's date
   * - Overlay ends the day BEFORE the earliest maintenance event that starts
   *   on or after the work tracker date (for the same bleacher)
   * - If no maintenance event exists, overlay extends to the end of the grid
   */
  private computeDamageOverlays(
    bleachers: Bleacher[],
    dates: string[],
  ): Map<number, DamageOverlayRange[]> {
    const result = new Map<number, DamageOverlayRange[]>();
    const dateToIndex = new Map(dates.map((d, i) => [d, i]));
    const lastCol = dates.length - 1;

    for (let row = 0; row < bleachers.length; row++) {
      const bleacher = bleachers[row];
      const damageReports = bleacher.damageReports ?? [];
      if (damageReports.length === 0) continue;

      // Sort maintenance events by start date ascending
      const maintEvents = [...(bleacher.maintenanceEvents ?? [])].sort((a, b) =>
        a.eventStart.localeCompare(b.eventStart),
      );

      const ranges: DamageOverlayRange[] = [];

      for (const dr of damageReports) {
        if (!dr.workTrackerDate) continue;

        const severity: DamageSeverity = !dr.isSafeToSit || !dr.isSafeToHaul ? "major" : "minor";

        const wtDateISO = DateTime.fromISO(dr.workTrackerDate).toISODate();
        if (!wtDateISO) continue;

        const wtCol = dateToIndex.get(wtDateISO);
        if (wtCol === undefined) continue;

        // Overlay starts the day after the work tracker
        const startCol = wtCol + 1;
        if (startCol > lastCol) continue;

        // Find the earliest maintenance event for this bleacher
        // that starts on or after the work tracker date
        let endCol = lastCol;
        for (const me of maintEvents) {
          const meStartISO = DateTime.fromISO(me.eventStart).toISODate();
          if (!meStartISO) continue;
          if (meStartISO >= wtDateISO) {
            const meCol = dateToIndex.get(meStartISO);
            if (meCol !== undefined && meCol > wtCol) {
              // Last overlay tile is the day before maintenance starts
              endCol = meCol - 1;
              break;
            }
          }
        }

        if (startCol <= endCol) {
          ranges.push({ startCol, endCol, severity });
        }
      }

      if (ranges.length > 0) {
        result.set(row, ranges);
      }
    }

    return result;
  }

  /**
   * Get the damage severity for a given cell, or null if not damaged.
   * If multiple ranges overlap, "major" wins over "minor".
   */
  private getDamageSeverity(row: number, col: number): DamageSeverity | null {
    const ranges = this.damageOverlaysByRow.get(row);
    if (!ranges) return null;
    let result: DamageSeverity | null = null;
    for (const r of ranges) {
      if (col >= r.startCol && col <= r.endCol) {
        if (r.severity === "major") return "major";
        result = "minor";
      }
    }
    return result;
  }

  /**
   * Set the cell editor instance
   */
  setCellEditor(cellEditor: CellEditor) {
    this.cellEditor = cellEditor;
  }

  /**
   * Update the current scroll position and cell width from the main grid
   * This should be called whenever the main grid scrolls horizontally
   */
  updateScrollPosition(scrollX: number, mainGridCellWidth: number) {
    this.currentScrollX = scrollX;
    this.cellWidth = mainGridCellWidth;
  }

  /**
   * Build cell content by composing UI components
   * This creates the actual visual content that will be baked into a texture by Grid
   */
  buildCell(
    row: number,
    col: number,
    cellWidth: number,
    cellHeight: number,
    parent: Container,
    firstVisibleColumn?: number,
  ): Container {
    // PERFORMANCE CRITICAL: Reuse existing container instead of creating new one
    // Clear existing children efficiently
    parent.removeChildren();

    const dimensions = { width: cellWidth, height: cellHeight };
    // Track visibility for targeted rebuilds on store updates
    const key = `${row}:${col}`;
    const oldKey = (parent as any).__cellKey as string | undefined;
    if (oldKey && oldKey !== key) {
      this.visibleCells.delete(oldKey);
    }
    (parent as any).__cellKey = key;
    this.visibleCells.set(key, { parent, w: cellWidth, h: cellHeight, firstVisibleColumn });
    parent.zIndex = 0;
    parent.sortableChildren = false;

    // zIndex: row-primary (lower rows behind higher rows for bleed),
    // column-secondary descending (earlier cols on top so labels aren't covered),
    // start-cell boost (+1) so start cells render above middle/end cells.
    const Z_ROW = 10000;

    // Get all events at this cell (handles overlapping spans)
    const allEventInfos = EventsUtil.getAllCellEventInfos(row, col, this.spansByRow);
    const damageSeverity = this.yAxis === "Bleachers" ? this.getDamageSeverity(row, col) : null;
    const isDamageCell = damageSeverity !== null;

    if (allEventInfos.length > 1) {
      // --- OVERLAPPING EVENTS ---
      parent.sortableChildren = true;
      const currentFirstVisibleColumn =
        firstVisibleColumn ?? Math.floor(this.currentScrollX / (this.cellWidth || 1));
      const hasStartCell = allEventInfos.some((e) => e.isStart);
      parent.zIndex = (row + 1) * Z_ROW - col * 2 + (hasStartCell ? 1 : 0);

      // Add damage tile behind events if applicable
      if (isDamageCell) {
        const dmgTile = new Tile(dimensions, this.baker, row, col, false, damageSeverity);
        dmgTile.zIndex = -1;
        parent.addChild(dmgTile);
      }

      for (const eventInfo of allEventInfos) {
        const ov = eventInfo.overlapInfo;
        const eventSprite = new EventBody(eventInfo, this.baker, dimensions, ov.topOffset);
        eventSprite.position.set(-1, -1);
        eventSprite.zIndex = ov.zIndex * 2;
        parent.addChild(eventSprite);

        // If start cell and not pinned, add label
        if (eventInfo.isStart && eventInfo.span) {
          const isPinned = EventsUtil.shouldEventBePinned(
            eventInfo.span,
            currentFirstVisibleColumn,
          );
          if (!isPinned) {
            const spanWidth = (eventInfo.span.end - eventInfo.span.start + 1) * CELL_WIDTH - 8;
            // Wrap label in a container masked to its event stripe
            // so it doesn't overflow on top of shorter overlapping events
            const labelWrapper = new Container();
            const label = new PinnableSection(eventInfo.span, this.app, this.baker, spanWidth);
            label.position.set(4, ov.topOffset + 4);
            labelWrapper.addChild(label);
            const stripeMask = new Graphics()
              .rect(0, ov.topOffset, spanWidth + 8, ov.height)
              .fill(0xffffff);
            labelWrapper.addChild(stripeMask);
            labelWrapper.mask = stripeMask;
            labelWrapper.zIndex = ov.zIndex * 2 + 1;
            parent.addChild(labelWrapper);
          }
        }
      }
    } else if (allEventInfos.length === 1) {
      // --- SINGLE EVENT (optimized path) ---
      const eventInfo = allEventInfos[0];
      const topOffset = eventInfo.overlapInfo.topOffset;

      // Use passed firstVisibleColumn or calculate from current scroll position
      const currentFirstVisibleColumn =
        firstVisibleColumn ?? Math.floor(this.currentScrollX / (this.cellWidth || 1));

      // Check if THIS specific event should be pinned
      const thisEventShouldBePinned = EventsUtil.shouldEventBePinned(
        eventInfo.span!,
        currentFirstVisibleColumn,
      );

      if (!thisEventShouldBePinned && eventInfo.isStart) {
        // UNPINNED EVENT: Cache the entire container for maximum performance
        parent.zIndex = (row + 1) * Z_ROW - col * 2 + 1;

        // Add damage tile behind event if applicable
        if (isDamageCell) {
          parent.sortableChildren = true;
          const dmgTile = new Tile(dimensions, this.baker, row, col, false, damageSeverity);
          dmgTile.zIndex = -1;
          parent.addChild(dmgTile);
        }

        const firstCell = new FirstCellNotPinned(
          eventInfo,
          currentFirstVisibleColumn,
          col,
          this.app,
          this.baker,
          dimensions,
          topOffset,
          eventInfo.overlapInfo.height,
        );
        firstCell.position.set(-1, -1);
        parent.addChild(firstCell);
      } else {
        parent.zIndex = (row + 1) * Z_ROW - col * 2;

        // Add damage tile behind event if applicable
        if (isDamageCell) {
          parent.sortableChildren = true;
          const dmgTile = new Tile(dimensions, this.baker, row, col, false, damageSeverity);
          dmgTile.zIndex = -1;
          parent.addChild(dmgTile);
        }

        const eventSprite = new EventBody(eventInfo, this.baker, dimensions, topOffset);
        eventSprite.position.set(-1, -1);
        parent.addChild(eventSprite);
      }
    } else {
      const tile = new Tile(
        dimensions,
        this.baker,
        row,
        col,
        this.yAxis === "Bleachers",
        damageSeverity,
      );
      parent.addChild(tile);

      // Attempt to find a block (bleachers mode only) using the latest store snapshot by bleacherUuid
      const bleacherUuid = this.rowBleacherUuids[row];
      const bleacher = this.latestBleachersByUuid.get(bleacherUuid) ?? this.bleachers[row];
      const date = this.dates[col];
      if (this.yAxis === "Bleachers" && bleacher && date) {
        const block = bleacher.blocks.find((b) => b.date === date);
        if (block && block.text) {
          const labelKey = `block:${bleacher.bleacherUuid}:${date}:${block.text}`;
          const textSprite = this.baker.getSprite(
            labelKey,
            { width: cellWidth, height: cellHeight },
            (c) => {
              const txt = new Text({
                text: block.text,
                style: {
                  fill: 0x1f2937,
                  fontSize: 10,
                  fontWeight: "500",
                  align: "center",
                  wordWrap: true,
                  wordWrapWidth: cellWidth - 8,
                },
              });
              txt.anchor.set(0.5);
              txt.position.set(cellWidth / 2, cellHeight / 2);
              c.addChild(txt);
            },
          );
          // IMPORTANT: add text inside the tile so pointer events bubble to tile
          textSprite.eventMode = "none"; // ensure it does not capture events itself
          tile.addChild(textSprite);
        }
      }

      // Set up click listener for cell editing (after adding children)
      if (this.yAxis === "Bleachers") {
        tile.on("cell:edit-request", (data: { row: number; col: number }) => {
          // If the click originated from a truck icon interaction, the callback will already have fired.
          // We rely on event stopping at the icon level; proceed with block load otherwise.
          this.handleLoadBlock(data.row, data.col);
        });
      }
    }

    // Render work tracker group AFTER event/tile rendering so it appears on top
    if (this.yAxis === "Bleachers") {
      const bleacherUuid = this.rowBleacherUuids[row];
      const bleacher = this.latestBleachersByUuid.get(bleacherUuid) ?? this.bleachers[row];
      const date = this.dates[col];
      if (bleacher && date) {
        const dateWorkTrackers = bleacher.workTrackers?.filter((wt) => wt.date === date) ?? [];
        if (dateWorkTrackers.length > 0) {
          const hasEventOverlap = allEventInfos.length > 0;
          const group = new WorkTrackerGroup(
            this.baker,
            dateWorkTrackers,
            hasEventOverlap,
            bleacher.bleacherUuid,
            date,
            (tracker) => {
              useWorkTrackerSelectionStore.getState().setSelected({
                id: tracker.workTrackerUuid ?? "-1",
                bleacher_uuid: bleacher.bleacherUuid,
                date,
              });
            },
          );
          // Ensure work trackers render in front of everything else in the cell
          group.zIndex = 99999;
          parent.sortableChildren = true;
          parent.addChild(group);
        }
      }
    }

    return parent;
  }

  private handleLoadBlock(rowIndex: number, columnIndex: number) {
    const store = useSelectedBlockStore.getState();
    const key = `${rowIndex}-${columnIndex}`;
    const bleacherUuid = this.rowBleacherUuids[rowIndex];
    const bleacher = this.latestBleachersByUuid.get(bleacherUuid) ?? this.bleachers[rowIndex];
    const date = this.dates[columnIndex];

    if (!bleacher || !date) return;

    // Find existing block for this date (exact match)
    const existingBlock = bleacher.blocks.find((b) => b.date === date);

    store.setField("isOpen", true);
    store.setField("key", key);
    store.setField("blockUuid", existingBlock?.blockUuid ?? null);
    store.setField("bleacherUuid", bleacher.bleacherUuid);
    store.setField("date", date);
    store.setField("text", existingBlock?.text ?? "");
    // Work tracker integration not yet wired in this data set
    // Attach workTrackerUuid if it exists for this bleacher/date
    const workTracker = bleacher.workTrackers?.find((wt) => wt.date === date);
    store.setField("workTrackerUuid", workTracker?.workTrackerUuid ?? null);
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.baker.destroyAll();
    try {
      this.unsubBleachers?.();
    } catch {}
    this.visibleCells.clear();
    // this.assetManager.destroy();
  }
}
