import { Application } from "pixi.js";
import { Grid } from "@/features/dashboard/util/Grid";
import { StickyTopRowCellRenderer } from "@/features/dashboard/cellRenderers/StickyTopRowCellRenderer";
import { TopLeftCellRenderer } from "@/features/dashboard/cellRenderers/TopLeftCellRenderer";
import { ResizeManager } from "@/features/dashboard/util/ResizeManager";
import { PngManager } from "@/features/dashboard/util/PngManager";
import { getColumnsAndDates } from "@/features/dashboard/util/scrollbar";
import {
  BLEACHER_COLUMN_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  HEADER_ROW_HEIGHT,
} from "@/features/dashboard/values/constants";
import { toDashboardRows, type GridRow } from "../utils/rows";
import type { SuggestedTrip } from "../utils/suggestions";
import { GhostPulse } from "./GhostTrip";
import {
  EventRowsLeftRenderer,
  EventRowsMainRenderer,
  EventRowsPinnedRenderer,
} from "./eventRowRenderers";

export type EventDashboardData = {
  rows: GridRow[];
  weekStart: string;
  suggestions: SuggestedTrip[];
};

type Options = EventDashboardData & {
  onAccept: (trip: SuggestedTrip) => void;
};

/**
 * The dashboard's grid, with rows grouped under the events that start in a week: the same four
 * scrolling quadrants (corner, dates, left column, main) plus the pinned layer, built from the
 * dashboard's own pieces. Read-only. Rebuilt whenever its data changes, keeping the scroll place.
 */
export class EventDashboard {
  private corner!: Grid;
  private topRow!: Grid;
  private leftColumn!: Grid;
  private main!: Grid;
  private pinned!: Grid;

  private mainRenderer!: EventRowsMainRenderer;
  private leftRenderer!: EventRowsLeftRenderer;
  private pinnedRenderer!: EventRowsPinnedRenderer;
  private topRenderer!: StickyTopRowCellRenderer;
  private cornerRenderer!: TopLeftCellRenderer;

  private readonly dates: string[];
  private readonly columns: number;
  private readonly resize: ResizeManager;
  private pulse: GhostPulse;
  private data: EventDashboardData;
  private readonly onAccept: (trip: SuggestedTrip) => void;

  constructor(
    private readonly app: Application,
    opts: Options,
  ) {
    PngManager.fetchAndCachePng(app);
    const { columns, dates } = getColumnsAndDates();
    this.dates = dates;
    this.columns = columns;
    this.data = opts;
    this.onAccept = opts.onAccept;
    this.pulse = new GhostPulse(app.ticker);

    this.build(this.initialScrollX(opts.weekStart), 0);

    this.resize = new ResizeManager(app, {
      onStableResize: () => this.rebuild(),
      log: false,
    });
    this.resize.start();
  }

  /** Replace the data (rows, week, suggestions). Scrolls to the week only when the week changed. */
  setData(data: EventDashboardData) {
    const weekChanged = data.weekStart !== this.data.weekStart;
    this.data = data;
    if (weekChanged) {
      this.teardown();
      this.build(this.initialScrollX(data.weekStart), 0);
    } else {
      this.rebuild();
    }
  }

  /** The scroll that puts the week's Monday near the left of the dates. */
  private initialScrollX(weekStart: string): number {
    const col = this.dates.indexOf(weekStart);
    if (col < 0) return Math.max(0, (this.columns * CELL_WIDTH) / 2);
    return Math.max(0, (col - 0.5) * CELL_WIDTH);
  }

  private rebuild() {
    const x = this.main?.getCurrentScrollX?.() ?? this.initialScrollX(this.data.weekStart);
    const y = this.main?.getCurrentScrollY?.() ?? 0;
    this.teardown();
    this.build(x, y);
  }

  private build(scrollX: number, scrollY: number) {
    const { app, dates, columns } = this;
    const { rows, weekStart, suggestions } = this.data;
    const bleachers = toDashboardRows(rows);

    this.pulse.destroy();
    this.pulse = new GhostPulse(app.ticker);

    this.mainRenderer = new EventRowsMainRenderer({
      app,
      rows,
      bleachers,
      dates,
      weekStart,
      suggestions,
      onAccept: this.onAccept,
      pulse: this.pulse,
    });
    this.leftRenderer = new EventRowsLeftRenderer(app, rows, bleachers);
    this.pinnedRenderer = new EventRowsPinnedRenderer(app, rows, bleachers, dates);
    this.topRenderer = new StickyTopRowCellRenderer(app);
    this.cornerRenderer = new TopLeftCellRenderer(app);

    const viewportWidth = app.screen.width - BLEACHER_COLUMN_WIDTH;
    const viewportHeight = app.screen.height - HEADER_ROW_HEIGHT;
    const rowCount = rows.length;

    this.corner = new Grid({
      app,
      rows: 1,
      cols: 1,
      cellWidth: BLEACHER_COLUMN_WIDTH,
      cellHeight: HEADER_ROW_HEIGHT,
      gridWidth: BLEACHER_COLUMN_WIDTH,
      gridHeight: HEADER_ROW_HEIGHT,
      cellRenderer: this.cornerRenderer,
      x: 0,
      y: 0,
      showScrollbar: false,
    });
    this.topRow = new Grid({
      app,
      rows: 1,
      cols: columns,
      cellWidth: CELL_WIDTH,
      cellHeight: HEADER_ROW_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: HEADER_ROW_HEIGHT,
      cellRenderer: this.topRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: 0,
      showScrollbar: false,
    });
    this.leftColumn = new Grid({
      app,
      rows: rowCount,
      cols: 1,
      cellWidth: BLEACHER_COLUMN_WIDTH,
      cellHeight: CELL_HEIGHT,
      gridWidth: BLEACHER_COLUMN_WIDTH,
      gridHeight: viewportHeight,
      cellRenderer: this.leftRenderer,
      x: 0,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: false,
    });
    this.main = new Grid({
      app,
      rows: rowCount,
      cols: columns,
      cellWidth: CELL_WIDTH,
      cellHeight: CELL_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: viewportHeight,
      cellRenderer: this.mainRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: true,
      allowScrolling: true,
    });
    this.pinned = new Grid({
      app,
      rows: rowCount,
      cols: 1,
      cellWidth: viewportWidth,
      cellHeight: CELL_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: viewportHeight,
      cellRenderer: this.pinnedRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: false,
      onlyUpdateWhenScrollStops: false,
    });

    this.main.on("grid:firstVisibleColIndexChanged", (firstVisibleCol: number) => {
      this.pinnedRenderer.setMainGridFirstVisibleColumn(firstVisibleCol);
      this.pinned.forceUpdate();
    });
    this.main.on("grid:scroll-vertical", (y: number) => {
      this.leftColumn.setVerticalScroll(y);
      this.pinned.setVerticalScroll(y);
    });
    this.main.on("grid:scroll-horizontal", (x: number) => {
      this.topRow.setHorizontalScroll(x);
      this.pinnedRenderer.updateScrollPosition(x, CELL_WIDTH);
      this.mainRenderer.updateScrollPosition(x, CELL_WIDTH);
      this.pinned.forceUpdate();
    });

    // Bottom-to-top stacking, as on the dashboard.
    app.stage.addChild(this.main);
    app.stage.addChild(this.pinned);
    app.stage.addChild(this.leftColumn);
    app.stage.addChild(this.topRow);
    app.stage.addChild(this.corner);

    this.main.setHorizontalScroll(scrollX);
    this.topRow.setHorizontalScroll(scrollX);
    this.main.updateHorizontalScrollbarPosition(scrollX);
    if (scrollY > 0) {
      const maxY = Math.max(0, this.main.getContentHeight() - this.main.getViewportHeight());
      const y = Math.min(scrollY, maxY);
      this.main.setVerticalScroll(y);
      this.leftColumn.setVerticalScroll(y);
      this.pinned.setVerticalScroll(y);
      this.main.updateVerticalScrollbarPosition(y);
    }
  }

  private teardown() {
    for (const grid of [this.main, this.pinned, this.leftColumn, this.topRow, this.corner]) {
      try {
        this.app.stage.removeChild(grid);
      } catch {}
      try {
        grid?.destroy();
      } catch {}
    }
    for (const renderer of [
      this.mainRenderer,
      this.leftRenderer,
      this.pinnedRenderer,
      this.topRenderer,
      this.cornerRenderer,
    ]) {
      try {
        renderer?.destroy();
      } catch {}
    }
  }

  destroy() {
    try {
      this.resize.destroy();
    } catch {}
    this.pulse.destroy();
    this.teardown();
  }
}
