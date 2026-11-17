import { Application, Container, Graphics, Text } from "pixi.js";
import type { ICellRenderer } from "@/features/dashboard/interfaces/ICellRenderer";
import type { Bleacher } from "@/features/dashboard/types";
import { MainGridCellRenderer } from "@/features/dashboard/cellRenderers/MainGridCellRenderer";
import { StickyLeftColumnCellRenderer } from "@/features/dashboard/cellRenderers/StickyLeftColumnCellRenderer";
import { PinnedYCellRenderer } from "@/features/dashboard/cellRenderers/PinnedYCellRenderer";
import type { GridRow, EventHeaderRow } from "../utils/rows";
import { ghostsByCell, type SuggestedTrip } from "../utils/suggestions";
import { GhostPulse, GhostTrip } from "./GhostTrip";

/**
 * The dashboard's own renderers, wrapped so some rows are event headers. A bleacher row is drawn by
 * the dashboard's renderer exactly as on the dashboard; a header row is drawn here. Rows are looked
 * up by index, so a bleacher repeated under several events is simply several rows.
 */

const HEADER_COLOR = 0xe0ebff;
const HEADER_READY_COLOR = 0xdcf3e3;
const HEADER_LINE = 0x93a4c4;
const WEEK_TINT = 0x2563eb;

function headerRowAt(rows: GridRow[], row: number): EventHeaderRow | null {
  const r = rows[row];
  return r && r.kind === "header" ? r : null;
}

function bandColor(header: EventHeaderRow): number {
  return header.ready ? HEADER_READY_COLOR : HEADER_COLOR;
}

/** Fit `text` in `maxWidth` pixels, ending in an ellipsis when it has to be cut. */
function fitText(text: Text, full: string, maxWidth: number) {
  text.text = full;
  if (text.width <= maxWidth) return;
  let low = 0;
  let high = full.length;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    text.text = `${full.slice(0, mid)}…`;
    if (text.width <= maxWidth) low = mid;
    else high = mid - 1;
  }
  text.text = low === 0 ? "" : `${full.slice(0, low)}…`;
}

/** This grid is for looking: nothing in a cell reacts to the pointer (the dashboard's panels are not here). */
function makeInert(container: Container) {
  for (const child of container.children) {
    child.eventMode = "none";
    if (child instanceof Container) makeInert(child);
  }
}

export type MainRendererOptions = {
  app: Application;
  rows: GridRow[];
  bleachers: Bleacher[];
  dates: string[];
  /** The Monday of the selected week: its days are tinted, as the range trips can be created in. */
  weekStart: string;
  suggestions: SuggestedTrip[];
  onAccept: (trip: SuggestedTrip) => void;
  pulse: GhostPulse;
};

/** Main grid: the dashboard's cells, the event header bands, the week tint and the ghost trips. */
export class EventRowsMainRenderer implements ICellRenderer {
  private readonly dashboard: MainGridCellRenderer;
  private readonly ghosts: Map<string, SuggestedTrip[]>;
  private readonly weekCols: Set<number>;

  constructor(private readonly opts: MainRendererOptions) {
    this.dashboard = new MainGridCellRenderer(
      opts.app,
      opts.bleachers,
      [],
      opts.dates,
      "Bleachers",
      undefined,
    );
    this.ghosts = ghostsByCell(opts.suggestions, opts.bleachers, opts.dates);
    this.weekCols = new Set<number>();
    const start = opts.dates.indexOf(opts.weekStart);
    if (start >= 0)
      for (let c = start; c < start + 7 && c < opts.dates.length; c++) this.weekCols.add(c);
  }

  updateScrollPosition(scrollX: number, cellWidth: number) {
    this.dashboard.updateScrollPosition(scrollX, cellWidth);
  }

  buildCell(
    row: number,
    col: number,
    cellWidth: number,
    cellHeight: number,
    parent: Container,
    firstVisibleColumn?: number,
  ): Container {
    const header = headerRowAt(this.opts.rows, row);
    if (header) {
      parent.removeChildren();
      parent.zIndex = 0;
      parent.sortableChildren = false;
      const band = new Graphics()
        .rect(0, 0, cellWidth, cellHeight)
        .fill(bandColor(header))
        .moveTo(0, cellHeight - 1)
        .lineTo(cellWidth, cellHeight - 1)
        .stroke({ width: 1, color: HEADER_LINE, alpha: 0.8 });
      parent.addChild(band);
      return parent;
    }

    this.dashboard.buildCell(row, col, cellWidth, cellHeight, parent, firstVisibleColumn);
    makeInert(parent);
    parent.eventMode = "passive";

    if (this.weekCols.has(col)) {
      const tint = new Graphics()
        .rect(0, 0, cellWidth, cellHeight)
        .fill({ color: WEEK_TINT, alpha: 0.05 });
      tint.eventMode = "none";
      tint.zIndex = 99998;
      parent.sortableChildren = true;
      parent.addChild(tint);
    }

    const trips = this.ghosts.get(`${row}:${col}`);
    if (trips?.length) {
      parent.sortableChildren = true;
      // Above everything else in the cell, and above the neighbouring cells' event bodies.
      parent.zIndex = Math.max(parent.zIndex, 20_000_000);
      const ghost = new GhostTrip(trips[0], this.opts.onAccept);
      ghost.zIndex = 200000;
      parent.addChild(ghost);
      this.opts.pulse.track(ghost);
    }
    return parent;
  }

  destroy() {
    this.dashboard.destroy();
  }
}

/** Left column: the dashboard's bleacher cells, and each event's name on its header row. */
export class EventRowsLeftRenderer implements ICellRenderer {
  private readonly dashboard: StickyLeftColumnCellRenderer;

  constructor(
    private readonly app: Application,
    private readonly rows: GridRow[],
    bleachers: Bleacher[],
  ) {
    this.dashboard = new StickyLeftColumnCellRenderer(app, bleachers, "Bleachers", []);
  }

  buildCell(row: number, col: number, cellWidth: number, cellHeight: number, parent: Container) {
    const header = headerRowAt(this.rows, row);
    if (!header) {
      this.dashboard.buildCell(row, col, cellWidth, cellHeight, parent);
      makeInert(parent);
      return parent;
    }

    parent.removeChildren();
    const band = new Graphics()
      .rect(0, 0, cellWidth, cellHeight)
      .fill(bandColor(header))
      .moveTo(0, cellHeight - 1)
      .lineTo(cellWidth, cellHeight - 1)
      .stroke({ width: 1, color: HEADER_LINE, alpha: 0.8 });
    const title = new Text({
      text: "",
      style: { fontSize: 12, fontWeight: "700", fill: 0x1e293b, fontFamily: "Helvetica" },
    });
    fitText(title, header.title, cellWidth - 12);
    title.position.set(6, 8);
    const status = new Text({
      text: header.status,
      style: {
        fontSize: 10,
        fontWeight: "600",
        fill: header.ready ? 0x15803d : 0xb91c1c,
        fontFamily: "Helvetica",
      },
    });
    status.position.set(6, cellHeight - status.height - 8);
    parent.addChild(band, title, status);
    return parent;
  }

  destroy() {
    this.dashboard.destroy();
  }
}

/**
 * Pinned layer over the main grid. A bleacher row keeps the dashboard's pinned event labels; an
 * event header row writes its date, address and status at the left edge of the viewport so they
 * stay in view while the dates scroll underneath.
 */
export class EventRowsPinnedRenderer implements ICellRenderer {
  private readonly dashboard: PinnedYCellRenderer;

  constructor(
    app: Application,
    private readonly rows: GridRow[],
    bleachers: Bleacher[],
    dates: string[],
  ) {
    this.dashboard = new PinnedYCellRenderer(app, bleachers, dates);
  }

  updateScrollPosition(scrollX: number, cellWidth: number) {
    this.dashboard.updateScrollPosition(scrollX, cellWidth);
  }

  setMainGridFirstVisibleColumn(col: number) {
    this.dashboard.setMainGridFirstVisibleColumn(col);
  }

  buildCell(
    row: number,
    col: number,
    cellWidth: number,
    cellHeight: number,
    parent: Container,
    firstVisibleColumn?: number,
  ) {
    const header = headerRowAt(this.rows, row);
    if (!header) {
      this.dashboard.buildCell(row, col, cellWidth, cellHeight, parent, firstVisibleColumn);
      makeInert(parent);
      return parent;
    }

    parent.removeChildren();
    parent.mask = null;
    const text = new Text({
      text: "",
      style: { fontSize: 12, fontWeight: "600", fill: 0x334155, fontFamily: "Helvetica" },
    });
    fitText(text, `${header.detail}   ·   ${header.status}`, cellWidth - 16);
    text.position.set(8, (cellHeight - text.height) / 2);
    text.eventMode = "none";
    parent.addChild(text);
    return parent;
  }

  destroy() {
    this.dashboard.destroy();
  }
}
