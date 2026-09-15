import { Application, Container, Text } from "pixi.js";
import { ICellRenderer } from "../interfaces/ICellRenderer";
import { Baker } from "../util/Baker";
import { EventBody } from "../ui/event/EventBody";
import { EventSpanType, EventsUtil } from "../util/Events";
import { Tile, DamageSeverity } from "../ui/Tile";
import { computeDamageOverlayRanges, type DamageOverlayRange } from "../util/damageOverlayRanges";
import { FirstCellNotPinned } from "../ui/event/FirstCellNotPinned";
import { PinnableSection } from "../ui/event/PinnableSection";
import { CELL_WIDTH } from "../values/constants";
import { CellEditor } from "../util/CellEditor";
import { Graphics } from "pixi.js";
import { WorkTrackerGroup } from "../ui/event/worktracker/WorkTrackerGroup";
import { DateTime } from "luxon";
import { Bleacher, DashboardEvent } from "../types";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { useSelectedBlockStore } from "../state/useSelectedBlock";
import { useWorkTrackerSelectionStore } from "@/features/workTrackers/state/useWorkTrackerSelectionStore";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";
import { isBleacherAccessible } from "../ui/NoAccessFilter";
import { SubrentalOverlayBody } from "../ui/event/SubrentalOverlayBody";
import { hasCreateWorkTrackerModifier, isMacPlatform } from "@/lib/platform";
import {
  buildWorkTrackerDraft,
  checkWorkTrackerOpenAccess,
} from "@/features/workTrackers/util/createWorkTrackerDraft";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { createErrorToast } from "@/components/toasts/ErrorToast";

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
  // Columns blocked by accepted subrentals on original rows (subrented out — nobody has access)
  private blockedColsByRow: Map<number, Set<number>> = new Map();
  // Columns accessible on subrental rows (only these are open; all others are inaccessible)
  private accessOnlyColsByRow: Map<number, Set<number>> = new Map();
  // Continuous accepted SR spans per row — used to render border-only overlays
  private acceptedSRSpansByRow: { start: number; end: number }[][] = [];

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
      const sr = useSubrentalEventStore.getState();
      const selectedSubrental =
        sr.isFormExpanded && sr.eventStart && sr.eventEnd && sr.bleacherUuid
          ? {
              subrentalEventUuid: sr.subrentalEventUuid ?? null,
              bleacherUuid: sr.bleacherUuid,
              eventStart: sr.eventStart,
              eventEnd: sr.eventEnd,
            }
          : undefined;
      const { spansByRow } = EventsUtil.calculateEventSpans(bleachers, dates, {
        selected,
        selectedMaintenance,
        selectedSubrental,
      });
      this.spansByRow = spansByRow;
    } else {
      this.spansByRow = this.calculateSpansByEvents(events, dates);
    }

    // Compute damage overlay ranges
    if (yAxis === "Bleachers") {
      this.damageOverlaysByRow = this.computeDamageOverlays(bleachers, dates);
      this.computeSubrentalColSets(bleachers, dates);
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
      const sr = useSubrentalEventStore.getState();
      const selectedSubrental =
        sr.isFormExpanded && sr.eventStart && sr.eventEnd && sr.bleacherUuid
          ? {
              subrentalEventUuid: sr.subrentalEventUuid ?? null,
              bleacherUuid: sr.bleacherUuid,
              eventStart: sr.eventStart,
              eventEnd: sr.eventEnd,
            }
          : undefined;
      const { spansByRow } = EventsUtil.calculateEventSpans(bleachers, this.dates, {
        selected,
        selectedMaintenance,
        selectedSubrental,
      });
      this.spansByRow = spansByRow;
    } else {
      this.spansByRow = this.calculateSpansByEvents(events, this.dates);
    }

    // Recompute damage overlays
    if (yAxis === "Bleachers") {
      this.damageOverlaysByRow = this.computeDamageOverlays(bleachers, this.dates);
      this.computeSubrentalColSets(bleachers, this.dates);
    } else {
      this.damageOverlaysByRow.clear();
      this.blockedColsByRow.clear();
      this.accessOnlyColsByRow.clear();
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
   * Pre-compute column sets for accepted subrental date ranges.
   * Called once on construction/setData — O(rows * subrental_days), not per cell.
   */
  private computeSubrentalColSets(bleachers: Bleacher[], dates: string[]) {
    this.blockedColsByRow.clear();
    this.accessOnlyColsByRow.clear();
    this.acceptedSRSpansByRow = [];
    const dateToIndex = new Map(dates.map((d, i) => [d, i]));

    const expandRanges = (
      ranges: { eventStart: string; eventEnd: string }[] | undefined,
    ): Set<number> => {
      const cols = new Set<number>();
      for (const r of ranges ?? []) {
        const startISO = DateTime.fromISO(r.eventStart).toISODate();
        const endISO = DateTime.fromISO(r.eventEnd).toISODate();
        if (!startISO || !endISO) continue;
        const startCol = dateToIndex.get(startISO);
        const endCol = dateToIndex.get(endISO);
        if (startCol === undefined || endCol === undefined) continue;
        for (let c = startCol; c <= endCol; c++) cols.add(c);
      }
      return cols;
    };

    const rangesToSpans = (
      ranges: { eventStart: string; eventEnd: string }[] | undefined,
    ): { start: number; end: number }[] => {
      const spans: { start: number; end: number }[] = [];
      for (const r of ranges ?? []) {
        const startISO = DateTime.fromISO(r.eventStart).toISODate();
        const endISO = DateTime.fromISO(r.eventEnd).toISODate();
        if (!startISO || !endISO) continue;
        const startCol = dateToIndex.get(startISO);
        const endCol = dateToIndex.get(endISO);
        if (startCol === undefined || endCol === undefined) continue;
        spans.push({ start: startCol, end: endCol });
      }
      return spans;
    };

    for (let row = 0; row < bleachers.length; row++) {
      const b = bleachers[row];
      if (b.acceptedSubrentalBlocks?.length) {
        const cols = expandRanges(b.acceptedSubrentalBlocks);
        if (cols.size) this.blockedColsByRow.set(row, cols);
      }
      if (b.acceptedSubrentalAccess?.length) {
        const cols = expandRanges(b.acceptedSubrentalAccess);
        if (cols.size) this.accessOnlyColsByRow.set(row, cols);
      }
      // Overlay spans: original rows show blocked-out periods; subrental rows show access windows
      const overlayRanges = b.isSubrentalRow
        ? (b.acceptedSubrentalAccess ?? [])
        : (b.acceptedSubrentalBlocks ?? []);
      this.acceptedSRSpansByRow[row] = rangesToSpans(overlayRanges);
    }
  }

  /**
   * Compute damage overlay column ranges for each bleacher row.
   *
   * Start/end rules live in `computeDamageOverlayRanges`: a strip opens on the day
   * its damage report was created and closes the day before maintenance work starts.
   */
  private computeDamageOverlays(
    bleachers: Bleacher[],
    dates: string[],
  ): Map<number, DamageOverlayRange[]> {
    const result = new Map<number, DamageOverlayRange[]>();

    for (let row = 0; row < bleachers.length; row++) {
      const bleacher = bleachers[row];
      const ranges = computeDamageOverlayRanges(
        bleacher.damageReports ?? [],
        bleacher.maintenanceEvents ?? [],
        dates,
      );
      if (ranges.length > 0) result.set(row, ranges);
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
    // Use row-indexed bleachers array, NOT latestBleachersByUuid — subrental rows share the same
    // bleacherUuid as their original row so the map would return whichever entry was inserted last.
    const baseAccessible = isBleacherAccessible(this.bleachers[row]);
    // Cell-level access: blocked cols override everyone (subrented out);
    // access-only cols restrict subrental rows to their subrental window.
    const isBlocked = this.blockedColsByRow.get(row)?.has(col) ?? false;
    const accessOnlyCols = this.accessOnlyColsByRow.get(row);
    const isAccessible = isBlocked
      ? false
      : accessOnlyCols
        ? baseAccessible && accessOnlyCols.has(col)
        : baseAccessible;

    if (allEventInfos.length > 1) {
      // --- OVERLAPPING EVENTS ---
      parent.sortableChildren = true;
      const currentFirstVisibleColumn =
        firstVisibleColumn ?? Math.floor(this.currentScrollX / (this.cellWidth || 1));
      const hasStartCell = allEventInfos.some((e) => e.isStart);
      parent.zIndex = (row + 1) * Z_ROW - col * 2 + (hasStartCell ? 1 : 0);

      // Add damage tile behind events if applicable
      if (isDamageCell) {
        const dmgTile = new Tile(
          dimensions,
          this.baker,
          row,
          col,
          false,
          damageSeverity,
          isAccessible,
        );
        dmgTile.zIndex = -1;
        parent.addChild(dmgTile);
      }

      for (const eventInfo of allEventInfos) {
        const ov = eventInfo.overlapInfo;
        const eventSprite = new EventBody(
          eventInfo,
          this.baker,
          dimensions,
          ov.topOffset,
          isAccessible,
        );
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
            const label = new PinnableSection(
              eventInfo.span,
              this.app,
              this.baker,
              spanWidth,
              isAccessible,
            );
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
          const dmgTile = new Tile(
            dimensions,
            this.baker,
            row,
            col,
            false,
            damageSeverity,
            isAccessible,
          );
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
          isAccessible,
        );
        firstCell.position.set(-1, -1);
        parent.addChild(firstCell);
      } else {
        parent.zIndex = (row + 1) * Z_ROW - col * 2;

        // Add damage tile behind event if applicable
        if (isDamageCell) {
          parent.sortableChildren = true;
          const dmgTile = new Tile(
            dimensions,
            this.baker,
            row,
            col,
            false,
            damageSeverity,
            isAccessible,
          );
          dmgTile.zIndex = -1;
          parent.addChild(dmgTile);
        }

        const eventSprite = new EventBody(
          eventInfo,
          this.baker,
          dimensions,
          topOffset,
          isAccessible,
        );
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
        isAccessible,
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
        tile.on(
          "cell:edit-request",
          (data: {
            row: number;
            col: number;
            metaKey: boolean;
            ctrlKey: boolean;
            button: number;
          }) => {
            // ⌘ (mac) / Ctrl (win) + click skips the cell editor popup and goes straight to a
            // new work tracker with the addresses and POCs pre-filled.
            if (hasCreateWorkTrackerModifier(data, isMacPlatform())) {
              if (this.handleCreateWorkTrackerShortcut(data.row, data.col)) return;
            }
            // If the click originated from a truck icon interaction, the callback will already have fired.
            // We rely on event stopping at the icon level; proceed with block load otherwise.
            this.handleLoadBlock(data.row, data.col);
          },
        );
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

    // // No-access overlay: grey-tints cells for rows the user doesn't have zone access to
    // if (this.yAxis === "Bleachers") {
    //   ...
    // }

    // Accepted subrental overlay — border-only, non-interactive, topmost layer
    if (this.yAxis === "Bleachers") {
      const srSpans = this.acceptedSRSpansByRow[row];
      if (srSpans?.length) {
        for (const span of srSpans) {
          if (col < span.start || col > span.end) continue;
          const isStart = col === span.start;
          const isEnd = col === span.end;
          const overlay = new SubrentalOverlayBody(
            { isStart, isEnd, isMiddle: !isStart && !isEnd },
            this.baker,
            dimensions,
          );
          overlay.position.set(-1, -1);
          overlay.zIndex = 100000;
          // Boost the cell container's zIndex well above all event cells so the SR
          // borders are never hidden behind a neighbouring container.
          // Event cells use (row+1)*Z_ROW - col*2 (max ≈ rows*10000).
          // Adding 10_000_000 guarantees SR overlay containers always win, while
          // the same column-descending formula keeps earlier cols on top within the span.
          const srContainerZ = (row + 1) * Z_ROW + 10_000_000 - col * 2 + (isStart ? 1 : 0);
          if (parent.zIndex < srContainerZ) {
            parent.zIndex = srContainerZ;
          }
          parent.sortableChildren = true;
          parent.addChild(overlay);
        }
      }
    }

    return parent;
  }

  /**
   * ⌘/Ctrl+click handler: open a brand-new work tracker for an empty cell.
   *
   * Returns false when the shortcut does not apply, so the caller falls back to the normal
   * cell-editor popup. The "is the cell empty" test lives here rather than relying on
   * `WorkTrackerGroup` swallowing the click: the group only stops `pointerdown`, and the exact
   * pixi event ordering between the group and the tile underneath is too brittle to lean on.
   */
  private handleCreateWorkTrackerShortcut(rowIndex: number, columnIndex: number): boolean {
    const bleacherUuid = this.rowBleacherUuids[rowIndex];
    const bleacher = this.latestBleachersByUuid.get(bleacherUuid) ?? this.bleachers[rowIndex];
    const date = this.dates[columnIndex];

    if (!bleacher || !date) return false;

    // Empty means "no work tracker on this date". A cell that only holds an event is still
    // empty — that is the main case, since the event is where the POC gets copied from.
    const hasWorkTracker = (bleacher.workTrackers ?? []).some((wt) => wt.date === date);
    if (hasWorkTracker) return false;

    const perms = usePermissionsStore.getState();
    const access = checkWorkTrackerOpenAccess({
      bleacherUuid: bleacher.bleacherUuid,
      date,
      workTrackerUuid: null,
      perms: {
        isAdmin: perms.isAdmin,
        isAccountManager: perms.isAccountManager,
        accountManagerZoneIds: perms.accountManagerZoneIds,
      },
      allBleachers: useDashboardBleachersStore.getState().data,
    });

    if (!access.allowed) {
      createErrorToast(access.messages);
      return true;
    }

    useWorkTrackerSelectionStore
      .getState()
      .openDraft(buildWorkTrackerDraft({ bleacherUuid: bleacher.bleacherUuid, date }), {
        autoPopulate: true,
      });

    return true;
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
