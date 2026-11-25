import { Application, Container, Graphics, Sprite } from "pixi.js";
import { ICellRenderer } from "../interfaces/ICellRenderer";
import { Baker } from "../util/Baker";
import { EventSpanType, EventsUtil, CellEventInfoWithOverlap } from "../util/Events";
import { LabelText } from "../ui/event/LabelText";
import { PinnableSection } from "../ui/event/PinnableSection";
import { Bleacher } from "../types";
import { CELL_WIDTH } from "../values/constants";
import { isBleacherAccessible } from "../ui/NoAccessFilter";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";

export class PinnedYCellRenderer implements ICellRenderer {
  private app: Application;
  private baker: Baker;
  private bleachers: Bleacher[];
  private spansByRow: EventSpanType[][];
  private dates: string[];
  private currentScrollX: number = 0;
  private cellWidth: number = 0; // Store the cell width from main grid
  private mainGridFirstVisibleColumn: number = 0; // Track main grid's first visible column
  private minWidthCache: Map<string, number> = new Map(); // Cache min label widths by event name
  private static measureCtx: CanvasRenderingContext2D | null = null;

  constructor(app: Application, bleachers: Bleacher[], dates: string[]) {
    this.app = app;
    this.baker = new Baker(app);
    this.bleachers = bleachers;
    this.dates = dates;

    // Calculate event spans once during construction
    const { spansByRow } = EventsUtil.calculateEventSpans(
      bleachers,
      dates,
      this.buildCalcOpts(bleachers),
    );
    this.spansByRow = spansByRow;
  }

  /** Update underlying bleacher array and recompute spans */
  public setData(bleachers: Bleacher[]) {
    this.bleachers = bleachers;
    const { spansByRow } = EventsUtil.calculateEventSpans(
      bleachers,
      this.dates,
      this.buildCalcOpts(bleachers),
    );
    this.spansByRow = spansByRow;
  }

  /** Build calculateEventSpans opts from current store state */
  private buildCalcOpts(bleachers: Bleacher[]) {
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
    return { selected, selectedSubrental };
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
   * Update the main grid's first visible column for pinning calculations
   */
  public setMainGridFirstVisibleColumn(firstVisibleColumn: number) {
    this.mainGridFirstVisibleColumn = firstVisibleColumn;
  }

  /**
   * Build cell content using BleacherCell component
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
    // PERFORMANCE CRITICAL: Reuse existing container
    parent.mask = null;
    parent.removeChildren();
    parent.sortableChildren = false;

    // Use the main grid's first visible column for pinning calculations
    const currentFirstVisibleColumn = this.mainGridFirstVisibleColumn;

    // Get all events at this column with overlap info
    const allEventInfos = EventsUtil.getAllCellEventInfos(
      row,
      currentFirstVisibleColumn,
      this.spansByRow,
    );

    // Filter to only pinned events
    const pinnedEvents = allEventInfos.filter(
      (ei) => ei.span && EventsUtil.shouldEventBePinned(ei.span, currentFirstVisibleColumn),
    );

    if (pinnedEvents.length > 0) {
      if (pinnedEvents.length > 1) parent.sortableChildren = true;

      for (const ei of pinnedEvents) {
        const span = ei.span!;
        const ov = ei.overlapInfo;

        // Use exact scrollX for smooth sub-cell-accurate width
        const subCellOffset = this.currentScrollX - currentFirstVisibleColumn * CELL_WIDTH;
        const spanRightEdge =
          (span.end - currentFirstVisibleColumn + 1) * CELL_WIDTH - subCellOffset;
        const availableWidth = spanRightEdge - 8;

        // Calculate minimum width: max(one cell width, longest word)
        const minWrapWidth = Math.max(CELL_WIDTH - 8, this.getLongestWordWidth(span.ev.eventName));

        const isAccessible = isBleacherAccessible(this.bleachers[row]);
        const pinnableSection = new PinnableSection(
          span,
          this.app,
          this.baker,
          Math.max(availableWidth, minWrapWidth),
          isAccessible,
        );

        if (availableWidth >= minWrapWidth) {
          // Pinned mode: label at left edge, wrapping to available width
          pinnableSection.position.set(4, ov.topOffset + 4);
        } else {
          // End-unpinned mode: right-justify label against span end, slides off left
          pinnableSection.position.set(spanRightEdge - minWrapWidth - 8, ov.topOffset + 4);
        }

        // Mask each label to its vertical stripe so it doesn't cover shorter events.
        // Shorter event bodies in the main grid (below the pinned grid) show through
        // the transparent areas of the pinned grid naturally.
        const stripeMask = new Graphics()
          .rect(0, ov.topOffset - 2, cellWidth, ov.height)
          .fill(0xffffff);
        parent.addChild(stripeMask);
        pinnableSection.mask = stripeMask;

        pinnableSection.zIndex = ov.zIndex;
        parent.addChild(pinnableSection);
      }
    }
    // If no pinned events, return empty container (transparent)

    return parent;
  }

  /**
   * Get the pixel width of the longest word in an event name.
   * Uses a shared canvas context and caches results.
   */
  private getLongestWordWidth(eventName: string): number {
    const cached = this.minWidthCache.get(eventName);
    if (cached !== undefined) return cached;

    if (!PinnedYCellRenderer.measureCtx) {
      const canvas = document.createElement("canvas");
      PinnedYCellRenderer.measureCtx = canvas.getContext("2d")!;
      PinnedYCellRenderer.measureCtx.font = "500 14px Helvetica";
    }

    const words = eventName.split(/\s+/);
    let maxWidth = 0;
    for (const word of words) {
      const w = PinnedYCellRenderer.measureCtx.measureText(word).width;
      if (w > maxWidth) maxWidth = w;
    }

    this.minWidthCache.set(eventName, maxWidth);
    return maxWidth;
  }

  /**
   * Clean up resources
   */
  destroy() {
    this.baker.destroyAll();
    this.minWidthCache.clear();
  }
}
