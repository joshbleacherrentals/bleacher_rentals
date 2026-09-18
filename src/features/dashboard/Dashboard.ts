import { Application } from "pixi.js";
import { Grid } from "./util/Grid";
import { MainGridCellRenderer } from "./cellRenderers/MainGridCellRenderer";
import { StickyLeftColumnCellRenderer } from "./cellRenderers/StickyLeftColumnCellRenderer";
import { StickyTopRowCellRenderer } from "./cellRenderers/StickyTopRowCellRenderer";
import { PinnedYCellRenderer } from "./cellRenderers/PinnedYCellRenderer";
import { TopLeftCellRenderer } from "./cellRenderers/TopLeftCellRenderer";
import { CellEditor } from "./util/CellEditor";
import { Bleacher, DashboardEvent } from "./types";
import {
  BLEACHER_COLUMN_WIDTH,
  CELL_HEIGHT,
  CELL_WIDTH,
  HEADER_ROW_HEIGHT,
} from "./values/constants";
import { getColumnsAndDates } from "./util/scrollbar";
import { ResizeManager } from "./util/ResizeManager";
import { useDashboardBleachersStore } from "./state/useDashboardBleachersStore";
import { useDashboardEventsStore } from "./state/useDashboardEventsStore";
import type { DashboardFilterState } from "../dashboardOptions/types";
import { filterEvents, filterSortPixiBleachers, getRowKey } from "../dashboardOptions/util";
import {
  filterSubrentalRowsByDateWindow,
  withoutSubrentalRows,
} from "./util/subrentalRowVisibility";
import { useCurrentEventStore } from "../eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "../maintenanceEvents/state/useMaintenanceEventStore";
import { useSubrentalEventStore } from "../subrentals/state/useSubrentalEventStore";
import { WorkTrackerDragManager } from "./util/WorkTrackerDragManager";
import { useTooltipStore } from "./state/useTooltipStore";
import { resolveAddress } from "../../utils/resolveAddress";
import { useScrollToDateStore } from "./state/useScrollToDateStore";
import { useAlertCountsStore } from "./state/useAlertCountsStore";

/** How long the horizontal scroll must settle before subrental rows are re-evaluated. */
const SUBRENTAL_WINDOW_DEBOUNCE_MS = 120;

export class Dashboard {
  // Grids
  private stickyTopLeftCell!: Grid;
  private stickyTopRow!: Grid;
  private stickyLeftColumn!: Grid;
  private mainGrid!: Grid;
  private mainGridPinnedYAxis!: Grid;

  // Renderers
  private mainGridPinYCellRenderer!: PinnedYCellRenderer; // Store reference for scroll updates
  private mainGridCellRenderer!: MainGridCellRenderer; // Store reference for scroll updates
  private leftColumnCellRenderer!: StickyLeftColumnCellRenderer;
  private topRowCellRenderer!: StickyTopRowCellRenderer;
  private topLeftCellRenderer!: TopLeftCellRenderer;

  // Cell editor
  private cellEditor!: CellEditor;

  // Store app reference for centering calculations
  private app: Application;

  private yAxis: "Bleachers" | "Events";
  private filters: DashboardFilterState;
  private scheduleRecompute?: () => void;
  private unsubBleachers?: () => void;
  private unsubEvents?: () => void;
  private unsubCurrentEvent?: () => void;
  private unsubMaintenance?: () => void;
  private unsubSubrental?: () => void;
  private unsubAlertCounts?: () => void;
  private bleachers: Bleacher[] = [];
  /** Rows before the subrental date-window filter — re-filtered on horizontal scroll. */
  private unwindowedBleachers: Bleacher[] = [];
  /** Row keys of the subrental rows currently shown, to detect when the set actually changes. */
  private subrentalWindowSignature = "";
  /** Bleachers pinned by an open form — their rows ignore the subrental date window. */
  private pinnedBleacherUuids: ReadonlySet<string> = new Set();
  /** Last known horizontal scroll position, also valid before the grids exist. */
  private lastScrollX = 0;
  private subrentalWindowTimeout: ReturnType<typeof setTimeout> | null = null;
  private events: DashboardEvent[] = [];
  private dates: string[] = [];
  private contentColumns = 0;
  // Track minimal signature of spans per bleacher to detect when recomputation is needed
  // private spanSignaturesByBleacherId: Map<number, string> = new Map();
  // Debounce/coalesce incoming changes
  private recomputeQueued = false;
  // Track and cleanup resize listeners
  // Resize handling via utility
  private resizeManager?: ResizeManager;

  // Address tooltip tracking
  private lastTooltipRow = -1;
  private lastTooltipCol = -1;
  private lastMousePageX = 0;
  private lastMousePageY = 0;
  private onCanvasMouseMove: ((e: MouseEvent) => void) | null = null;

  constructor(
    app: Application,
    opts?: {
      initialScrollX?: number | null;
      initialScrollY?: number | null;
      filters?: DashboardFilterState;
    },
  ) {
    this.app = app;
    // Get dates for event calculations
    const { columns: contentColumns, dates } = getColumnsAndDates();
    this.dates = dates;
    this.contentColumns = contentColumns;

    this.filters =
      opts?.filters ??
      ({
        yAxis: "Bleachers",
        rows: [],
        stateProvinces: [],
        onlyShowMyEvents: true,
        optimizationMode: false,
        showAddressTooltip: false,
        showDistanceTooltip: false,
        rowsQuickFilter: null,
        zoneUuids: [],
        showUnassignedZone: false,
        hideAllSubrentals: false,
      } satisfies DashboardFilterState);

    this.yAxis = this.filters.yAxis;

    // Build initial filtered datasets
    const allBleachers = useDashboardBleachersStore.getState().data;
    const allEvents = useDashboardEventsStore.getState().data;
    const currentEvent = useCurrentEventStore.getState();

    const filteredBleachers = filterSortPixiBleachers(allBleachers, {
      rows: this.filters.rows,
      zoneUuids: this.filters.zoneUuids,
      showUnassignedZone: this.filters.showUnassignedZone,
      alwaysIncludeBleacherUuids: currentEvent.bleacherUuids ?? [],
      isFormExpanded: currentEvent.isFormExpanded,
      optimizationMode: this.filters.optimizationMode,
    });

    const filteredEvents =
      this.yAxis === "Events" && this.filters.stateProvinces.length > 0
        ? filterEvents(allEvents, this.filters.stateProvinces)
        : allEvents;

    this.pinnedBleacherUuids = new Set(
      currentEvent.isFormExpanded ? (currentEvent.bleacherUuids ?? []) : [],
    );

    // Seed the scroll position so the first subrental window can be computed before the grids
    // exist — either the restored scroll or the centered position initGrids will apply.
    this.lastScrollX =
      typeof opts?.initialScrollX === "number" && opts.initialScrollX >= 0
        ? opts.initialScrollX
        : Math.max(
            0,
            (contentColumns * CELL_WIDTH - (app.screen.width - BLEACHER_COLUMN_WIDTH)) / 2,
          );

    this.unwindowedBleachers = filteredBleachers;
    this.bleachers = this.applySubrentalWindow(filteredBleachers);
    this.events = filteredEvents;

    this.initGrids(opts);

    // Initialize ResizeManager to handle resize lifecycle
    this.resizeManager = new ResizeManager(this.app, {
      onStableResize: () => {
        this.rebuildGrids();
      },
      log: false,
    });
    this.resizeManager.start();

    // Unified recompute method
    const computeSpanSignatures = (bleachers: Bleacher[]): Map<string, string> => {
      const map = new Map<string, string>();
      for (const b of bleachers) {
        const sig = (b.bleacherEvents || [])
          .map((ev: any) => `${ev.eventUuid}:${ev.eventStart}:${ev.eventEnd}`)
          .sort()
          .join("|");
        map.set(b.bleacherUuid, sig);
      }
      return map;
    };

    const scheduleRecompute = () => {
      if (this.recomputeQueued) return;
      this.recomputeQueued = true;
      requestAnimationFrame(() => {
        this.recomputeQueued = false;
        this.recompute();
      });
    };

    // console.log("is this thing on?");

    // Initialize span signatures for current rows
    // not important until we want to compare with previous state to conditionally re-render things.
    // this.spanSignaturesByBleacherId = computeSpanSignatures(this.bleachers);

    this.scheduleRecompute = scheduleRecompute;

    // Subscribe once and coalesce recomputes
    this.unsubCurrentEvent = useCurrentEventStore.subscribe(() => scheduleRecompute());
    this.unsubMaintenance = useMaintenanceEventStore.subscribe(() => scheduleRecompute());
    this.unsubSubrental = useSubrentalEventStore.subscribe(() => scheduleRecompute());
    this.unsubEvents = useDashboardEventsStore.subscribe(() => scheduleRecompute());
    this.unsubBleachers = useDashboardBleachersStore.subscribe(() => scheduleRecompute());
    this.unsubAlertCounts = useAlertCountsStore.subscribe(() => scheduleRecompute());

    // Note: initial scroll handling is performed in initGrids using opts

    // Address tooltip: use native DOM mousemove for correct page coordinates
    this.onCanvasMouseMove = (e: MouseEvent) => {
      this.lastMousePageX = e.clientX;
      this.lastMousePageY = e.clientY;
      this.updateTooltip();
    };

    app.canvas.addEventListener("mousemove", this.onCanvasMouseMove);
    app.canvas.addEventListener("mouseleave", () => {
      useTooltipStore.getState().hide();
      this.lastTooltipRow = -1;
      this.lastTooltipCol = -1;
    });

    // Register scrollToDate so React components can scroll the dashboard
    useScrollToDateStore.getState().setScrollToDate((date: string) => {
      this.scrollToDate(date);
    });
  }

  /**
   * Handle window resize: log new dimensions and relevant grid metrics
   */
  // resize is managed by ResizeManager

  /**
   * Resolve and update the hover tooltip (address or distance) based on current mouse
   * position and scroll. Address and distance modes are mutually exclusive.
   */
  private updateTooltip() {
    const mode: "address" | "distance" | null = this.filters.showAddressTooltip
      ? "address"
      : this.filters.showDistanceTooltip
        ? "distance"
        : null;

    const store = useTooltipStore.getState();
    const hideIfShown = () => {
      if (store.content !== null) store.hide();
    };

    if (!mode || this.yAxis !== "Bleachers") {
      hideIfShown();
      return;
    }

    const canvas = this.app.canvas;
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;

    // Convert page coordinates to PixiJS logical coordinates
    const pixiX = ((this.lastMousePageX - rect.left) / rect.width) * (canvas.width / dpr);
    const pixiY = ((this.lastMousePageY - rect.top) / rect.height) * (canvas.height / dpr);

    // Check if mouse is within the main grid area
    const gridX = pixiX - BLEACHER_COLUMN_WIDTH;
    const gridY = pixiY - HEADER_ROW_HEIGHT;
    if (gridX < 0 || gridY < 0) {
      hideIfShown();
      this.lastTooltipRow = -1;
      this.lastTooltipCol = -1;
      return;
    }

    // Calculate cell row/col from grid-local coordinates + scroll offset
    const scrollX = this.mainGrid?.getCurrentScrollX?.() ?? 0;
    const scrollY = this.mainGrid?.getCurrentScrollY?.() ?? 0;
    const col = Math.floor((gridX + scrollX) / CELL_WIDTH);
    const row = Math.floor((gridY + scrollY) / CELL_HEIGHT);

    if (row < 0 || row >= this.bleachers.length || col < 0 || col >= this.dates.length) {
      hideIfShown();
      this.lastTooltipRow = -1;
      this.lastTooltipCol = -1;
      return;
    }

    // Only re-resolve content when the cell changes (keeps distance query keys stable
    // while the cursor moves within a single cell).
    if (row !== this.lastTooltipRow || col !== this.lastTooltipCol) {
      this.lastTooltipRow = row;
      this.lastTooltipCol = col;

      const bleacher = this.bleachers[row];
      const targetDate = this.dates[col];

      if (mode === "address") {
        const address = resolveAddress(bleacher, targetDate);
        if (!address) {
          store.hide();
          return;
        }
        store.show({ kind: "address", text: address }, this.lastMousePageX, this.lastMousePageY);
      } else {
        const origin = resolveAddress(bleacher, targetDate, "past");
        const dest = resolveAddress(bleacher, targetDate, "future");
        if (!origin || !dest) {
          store.hide();
          return;
        }
        store.show({ kind: "distance", origin, dest }, this.lastMousePageX, this.lastMousePageY);
      }
    } else if (store.content) {
      // Same cell — just update position
      store.show(store.content, this.lastMousePageX, this.lastMousePageY);
    }
  }

  /**
   * Unified recompute: reads all stores, computes filtered data, and applies minimal updates
   */
  private recompute() {
    const filters = this.filters;
    this.yAxis = filters.yAxis;

    const allBleachers = useDashboardBleachersStore.getState().data;
    const allEvents = useDashboardEventsStore.getState().data;
    const currentEvent = useCurrentEventStore.getState();
    const maintenanceEvent = useMaintenanceEventStore.getState();
    const subrentalEvent = useSubrentalEventStore.getState();

    // Combine bleacher UUIDs from event, maintenance, and subrental forms so they stay visible
    const alwaysInclude = [
      ...(currentEvent.bleacherUuids ?? []),
      ...(maintenanceEvent.isFormExpanded ? maintenanceEvent.bleacherUuids : []),
      ...(subrentalEvent.isFormExpanded && subrentalEvent.bleacherUuid
        ? [subrentalEvent.bleacherUuid]
        : []),
    ];

    const filteredBleachers = filterSortPixiBleachers(allBleachers, {
      rows: filters.rows,
      zoneUuids: filters.zoneUuids,
      showUnassignedZone: filters.showUnassignedZone,
      alwaysIncludeBleacherUuids: alwaysInclude,
      isFormExpanded:
        currentEvent.isFormExpanded ||
        maintenanceEvent.isFormExpanded ||
        subrentalEvent.isFormExpanded,
      optimizationMode: filters.optimizationMode,
    });

    const filteredEvents =
      this.yAxis === "Events" && filters.stateProvinces.length > 0
        ? filterEvents(allEvents, filters.stateProvinces)
        : allEvents;

    const anyFormExpanded =
      currentEvent.isFormExpanded ||
      maintenanceEvent.isFormExpanded ||
      subrentalEvent.isFormExpanded;
    this.pinnedBleacherUuids = new Set(anyFormExpanded ? alwaysInclude : []);

    // Update snapshots
    this.unwindowedBleachers = filteredBleachers;
    this.bleachers = this.applySubrentalWindow(filteredBleachers);
    this.events = filteredEvents;
    this.rebuildGrids(); // rebuild grids no matter what for now. Removes any animations for displaying new components.
  }

  public setFilters(filters: DashboardFilterState) {
    this.filters = filters;
    this.scheduleRecompute?.();
  }

  /**
   * Initialize renderers and grids based on current bleachers/events/filters
   */
  private initGrids(opts?: { initialScrollX?: number | null; initialScrollY?: number | null }) {
    const app = this.app;
    const dates = this.dates;
    const contentColumns = this.contentColumns;

    this.mainGridCellRenderer = new MainGridCellRenderer(
      app,
      this.bleachers,
      this.events,
      dates,
      this.yAxis,
      undefined,
    );
    this.mainGridPinYCellRenderer = new PinnedYCellRenderer(app, this.bleachers, dates);
    this.leftColumnCellRenderer = new StickyLeftColumnCellRenderer(
      app,
      this.bleachers,
      this.yAxis,
      this.events,
    );
    this.topRowCellRenderer = new StickyTopRowCellRenderer(app);
    this.topLeftCellRenderer = new TopLeftCellRenderer(app);

    // Calculate viewport dimensions
    const viewportWidth = app.screen.width - BLEACHER_COLUMN_WIDTH;
    const viewportHeight = app.screen.height - HEADER_ROW_HEIGHT;

    const rowsCount = this.yAxis === "Bleachers" ? this.bleachers.length : this.events.length;

    // Top-left: Fixed corner cell (1x1)
    this.stickyTopLeftCell = new Grid({
      app,
      rows: 1,
      cols: 1,
      cellWidth: BLEACHER_COLUMN_WIDTH,
      cellHeight: HEADER_ROW_HEIGHT,
      gridWidth: BLEACHER_COLUMN_WIDTH,
      gridHeight: HEADER_ROW_HEIGHT,
      cellRenderer: this.topLeftCellRenderer,
      x: 0,
      y: 0,
      showScrollbar: false,
    });

    // Top-right: Sticky header row (horizontal scrollable)
    this.stickyTopRow = new Grid({
      app,
      rows: 1,
      cols: contentColumns,
      cellWidth: CELL_WIDTH,
      cellHeight: HEADER_ROW_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: HEADER_ROW_HEIGHT,
      cellRenderer: this.topRowCellRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: 0,
      showScrollbar: false,
    });

    // Bottom-left: Sticky left column (vertical scrollable)
    this.stickyLeftColumn = new Grid({
      app,
      rows: rowsCount,
      cols: 1,
      cellWidth: BLEACHER_COLUMN_WIDTH,
      cellHeight: CELL_HEIGHT,
      gridWidth: BLEACHER_COLUMN_WIDTH,
      gridHeight: viewportHeight,
      cellRenderer: this.leftColumnCellRenderer,
      x: 0,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: false,
    });

    // Bottom-right: Main scrollable content
    this.mainGrid = new Grid({
      app,
      rows: rowsCount,
      cols: contentColumns,
      cellWidth: CELL_WIDTH,
      cellHeight: CELL_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: viewportHeight,
      cellRenderer: this.mainGridCellRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: true,
      allowScrolling: true,
    });

    // another grid in front of main grid that renders the pinned y axis
    this.mainGridPinnedYAxis = new Grid({
      app,
      rows: rowsCount,
      cols: 1,
      cellWidth: viewportWidth,
      cellHeight: CELL_HEIGHT,
      gridWidth: viewportWidth,
      gridHeight: viewportHeight,
      cellRenderer: this.mainGridPinYCellRenderer,
      x: BLEACHER_COLUMN_WIDTH,
      y: HEADER_ROW_HEIGHT,
      showScrollbar: false,
      onlyUpdateWhenScrollStops: false,
    });

    // When main grid completes a cell update cycle, update the pinned Y axis
    this.mainGrid.on("grid:firstVisibleColIndexChanged", (firstVisibleCol: number) => {
      if (this.yAxis === "Bleachers") {
        this.mainGridPinYCellRenderer.setMainGridFirstVisibleColumn(firstVisibleCol);
        this.mainGridPinnedYAxis.forceUpdate();
      }
    });

    // Add grids in bottom-to-top stacking order
    app.stage.addChild(this.mainGrid);
    if (this.yAxis === "Bleachers") {
      app.stage.addChild(this.mainGridPinnedYAxis);
    }
    app.stage.addChild(this.stickyLeftColumn);
    app.stage.addChild(this.stickyTopRow);
    app.stage.addChild(this.stickyTopLeftCell);

    // Initialize cell editor for the main grid
    this.cellEditor = new CellEditor({
      app,
      grid: this.mainGrid,
      cellWidth: CELL_WIDTH,
      cellHeight: CELL_HEIGHT,
      gridOffsetX: BLEACHER_COLUMN_WIDTH,
      gridOffsetY: HEADER_ROW_HEIGHT,
    });
    this.mainGridCellRenderer.setCellEditor(this.cellEditor);

    // Initialize drag manager for work tracker drag-and-drop
    if (this.yAxis === "Bleachers") {
      WorkTrackerDragManager.init(
        app,
        this.mainGrid,
        this.dates,
        this.bleachers.map((b) => b.bleacherUuid),
      );
    }

    // Set up scroll synchronization
    this.setupScrollSynchronization();

    // Apply initial scroll positions if provided
    const hasX = typeof opts?.initialScrollX === "number" && opts.initialScrollX! >= 0;
    const hasY = typeof opts?.initialScrollY === "number" && opts.initialScrollY! >= 0;
    if (hasX) {
      this.mainGrid.setHorizontalScroll(opts!.initialScrollX!);
      this.stickyTopRow.setHorizontalScroll(opts!.initialScrollX!);
      this.mainGrid.updateHorizontalScrollbarPosition(opts!.initialScrollX!);
      this.cellEditor.setScrollPosition(opts!.initialScrollX!, 0);
    } else {
      this.centerHorizontalScroll();
    }
    if (hasY) {
      const contentHeight = this.mainGrid.getContentHeight();
      const viewportHeight = this.mainGrid.getViewportHeight();
      const maxContentY = Math.max(0, contentHeight - viewportHeight);
      const targetY = Math.min(Math.max(opts!.initialScrollY!, 0), maxContentY);
      this.mainGrid.setVerticalScroll(targetY);
      this.stickyLeftColumn.setVerticalScroll(targetY);
      this.mainGridPinnedYAxis.setVerticalScroll(targetY);
      this.mainGrid.updateVerticalScrollbarPosition(targetY);
    }
  }

  /**
   * First and last dates currently on screen, used to decide which subrental rows are shown.
   */
  private visibleDateWindow(): { start: string | undefined; end: string | undefined } {
    if (this.dates.length === 0) return { start: undefined, end: undefined };

    const scrollX = this.mainGrid?.getCurrentScrollX?.() ?? this.lastScrollX;
    const viewportWidth = this.app.screen.width - BLEACHER_COLUMN_WIDTH;
    const firstCol = Math.max(0, Math.floor(scrollX / CELL_WIDTH));
    const lastCol = Math.min(
      this.dates.length - 1,
      Math.ceil((scrollX + viewportWidth) / CELL_WIDTH) - 1,
    );
    if (lastCol < firstCol) return { start: undefined, end: undefined };

    return { start: this.dates[firstCol], end: this.dates[lastCol] };
  }

  /**
   * Drops subrental rows whose subrentals are more than two weeks away from the visible dates,
   * and records the resulting set so scrolling only rebuilds when it actually changes.
   */
  private applySubrentalWindow(bleachers: Bleacher[]): Bleacher[] {
    if (this.filters.hideAllSubrentals) {
      this.subrentalWindowSignature = "";
      return withoutSubrentalRows(bleachers, this.pinnedBleacherUuids);
    }

    const { start, end } = this.visibleDateWindow();
    const windowed = filterSubrentalRowsByDateWindow(
      bleachers,
      start,
      end,
      this.pinnedBleacherUuids,
    );
    this.subrentalWindowSignature = windowed
      .filter((b) => b.isSubrentalRow)
      .map(getRowKey)
      .join("|");
    return windowed;
  }

  /**
   * Re-evaluates the subrental rows for the current scroll position; rebuilds only when the set of
   * visible subrental rows changed.
   */
  private refreshSubrentalWindow() {
    if (this.yAxis !== "Bleachers") return;

    const previousRows = this.bleachers;
    const previousSignature = this.subrentalWindowSignature;
    const windowed = this.applySubrentalWindow(this.unwindowedBleachers);
    if (this.subrentalWindowSignature === previousSignature) return;

    this.bleachers = windowed;
    this.rebuildGrids({ previousRows });
  }

  /**
   * Keeps the row at the top of the viewport in place when rows appear or disappear above it,
   * instead of holding the raw pixel offset (which makes the content jump).
   */
  private anchoredScrollY(previousRows: Bleacher[], scrollY: number): number {
    const topIndex = Math.floor(scrollY / CELL_HEIGHT);
    const offsetWithinRow = scrollY - topIndex * CELL_HEIGHT;

    const newIndexByKey = new Map(this.bleachers.map((b, i) => [getRowKey(b), i]));

    // Anchor on the topmost previously visible row that survived; if the top row itself
    // disappeared, fall through to the next one down.
    for (let i = topIndex; i < previousRows.length; i++) {
      const newIndex = newIndexByKey.get(getRowKey(previousRows[i]));
      if (newIndex === undefined) continue;
      const rowsBelowTop = i - topIndex;
      return Math.max(0, (newIndex - rowsBelowTop) * CELL_HEIGHT + offsetWithinRow);
    }

    return scrollY;
  }

  /**
   * Tear down and rebuild grids and renderers using latest store-filtered data.
   * Preserves current scroll positions.
   */
  private rebuildGrids(opts?: { previousRows?: Bleacher[] }) {
    // Preserve scroll positions
    const x = (this.mainGrid as any)?.getCurrentScrollX?.() ?? 0;
    const y = (this.mainGrid as any)?.getCurrentScrollY?.() ?? 0;
    const targetY = opts?.previousRows ? this.anchoredScrollY(opts.previousRows, y) : y;
    this.teardownGrids();
    this.initGrids({ initialScrollX: x, initialScrollY: targetY });
  }

  /** Remove grids from stage and destroy them safely */
  private teardownGrids() {
    try {
      this.app.stage.removeChild(this.mainGrid);
    } catch {}
    try {
      this.app.stage.removeChild(this.mainGridPinnedYAxis);
    } catch {}
    try {
      this.app.stage.removeChild(this.stickyLeftColumn);
    } catch {}
    try {
      this.app.stage.removeChild(this.stickyTopRow);
    } catch {}
    try {
      this.app.stage.removeChild(this.stickyTopLeftCell);
    } catch {}

    try {
      this.cellEditor?.destroy();
    } catch {}
    try {
      this.mainGrid?.destroy();
    } catch {}
    try {
      this.mainGridPinnedYAxis?.destroy();
    } catch {}
    try {
      this.stickyLeftColumn?.destroy();
    } catch {}
    try {
      this.stickyTopRow?.destroy();
    } catch {}
    try {
      this.stickyTopLeftCell?.destroy();
    } catch {}

    //   private mainGridPinYCellRenderer!: PinnedYCellRenderer; // Store reference for scroll updates
    // private mainGridCellRenderer!: MainGridCellRenderer; // Store reference for scroll updates
    // private leftColumnCellRenderer!: StickyLeftColumnCellRenderer;
    // private topRowCellRenderer!: StickyTopRowCellRenderer;
    // private topLeftCellRenderer!: TopLeftCellRenderer;
    try {
      this.mainGridPinYCellRenderer.destroy();
    } catch {}
    try {
      this.mainGridCellRenderer.destroy();
    } catch {}
    try {
      this.leftColumnCellRenderer.destroy();
    } catch {}
    try {
      this.topRowCellRenderer.destroy();
    } catch {}
    try {
      this.topLeftCellRenderer.destroy();
    } catch {}
  }

  /**
   * Center the horizontal scroll position on initial load
   * Returns the calculated center position
   */
  private centerHorizontalScroll(): number {
    // Calculate the center position based on content width and viewport width
    const contentWidth = this.mainGrid.getContentWidth();
    const viewportWidth = this.app.screen.width - BLEACHER_COLUMN_WIDTH;

    // Calculate center position (content width / 2 - viewport width / 2)
    const centerX = Math.max(0, (contentWidth - viewportWidth) / 2);

    // console.log(
    //   `Centering horizontal scroll: contentWidth=${contentWidth}, viewportWidth=${viewportWidth}, centerX=${centerX}`
    // );

    // Set the horizontal scroll on ALL grids that need horizontal centering
    this.mainGrid.setHorizontalScroll(centerX);
    this.stickyTopRow.setHorizontalScroll(centerX);

    // Update the scrollbar positions to match (only main grid has visible scrollbar)
    this.mainGrid.updateHorizontalScrollbarPosition(centerX);

    // Update the cell editor with the new scroll position
    this.cellEditor.setScrollPosition(centerX, 0);

    // Return the center position so we can use it for renderer initialization
    return centerX;
  }

  /**
   * Synchronize scrolling between the quadrants
   */
  private setupScrollSynchronization() {
    // When main grid scrolls vertically, sync the left column and pinned Y axis
    this.mainGrid.on("grid:scroll-vertical", (scrollY: number) => {
      this.stickyLeftColumn.setVerticalScroll(scrollY);
      this.mainGridPinnedYAxis.setVerticalScroll(scrollY);
      this.updateTooltip();
    });

    // When main grid scrolls horizontally, sync the top row and update both renderers
    this.mainGrid.on("grid:scroll-horizontal", (scrollX: number) => {
      this.stickyTopRow.setHorizontalScroll(scrollX);

      // Update both renderers with current scroll position
      this.mainGridPinYCellRenderer.updateScrollPosition(scrollX, CELL_WIDTH);
      this.mainGridCellRenderer.updateScrollPosition(scrollX, CELL_WIDTH);

      // Force update pinned Y axis on every scroll for smooth text wrapping
      if (this.yAxis === "Bleachers") {
        this.mainGridPinnedYAxis.forceUpdate();
      }

      // Update tooltip on scroll so it resolves the new cell under cursor
      this.updateTooltip();

      // Subrental rows come and go with the visible dates — wait for the scroll to settle so we
      // rebuild the grids once instead of on every scroll event.
      this.lastScrollX = scrollX;
      if (this.subrentalWindowTimeout) clearTimeout(this.subrentalWindowTimeout);
      this.subrentalWindowTimeout = setTimeout(() => {
        this.subrentalWindowTimeout = null;
        this.refreshSubrentalWindow();
      }, SUBRENTAL_WINDOW_DEBOUNCE_MS);
    });

    // Horizontal centering moved to constructor after potential initialScrollX check
  }

  /** Current scroll positions (content px) */
  public getScrollPositions(): { x: number; y: number } {
    const x = (this.mainGrid as any)?.getCurrentScrollX?.() ?? 0;
    const y = (this.mainGrid as any)?.getCurrentScrollY?.() ?? 0;
    return { x, y };
  }

  /**
   * Scroll the dashboard so the given date column is centered horizontally
   */
  public scrollToDate(date: string) {
    const colIndex = this.dates.indexOf(date);
    if (colIndex === -1) return;

    const viewportWidth = this.app.screen.width - BLEACHER_COLUMN_WIDTH;
    const targetX = Math.max(0, colIndex * CELL_WIDTH - viewportWidth / 2 + CELL_WIDTH / 2);

    this.mainGrid.setHorizontalScroll(targetX);
    this.stickyTopRow.setHorizontalScroll(targetX);
    this.mainGrid.updateHorizontalScrollbarPosition(targetX);
    this.cellEditor.setScrollPosition(targetX, this.mainGrid.getCurrentScrollY());
  }

  /**
   * Clean up resources
   */
  destroy() {
    try {
      if (this.subrentalWindowTimeout) clearTimeout(this.subrentalWindowTimeout);
      this.subrentalWindowTimeout = null;
    } catch {}
    try {
      this.resizeManager?.destroy();
    } catch {}
    try {
      this.unsubCurrentEvent?.();
    } catch {}
    try {
      this.unsubMaintenance?.();
    } catch {}
    try {
      this.unsubSubrental?.();
    } catch {}
    try {
      this.unsubBleachers?.();
    } catch {}
    try {
      this.unsubEvents?.();
    } catch {}
    try {
      this.unsubAlertCounts?.();
    } catch {}
    try {
      if (this.onCanvasMouseMove) {
        this.app.canvas.removeEventListener("mousemove", this.onCanvasMouseMove);
      }
      useTooltipStore.getState().hide();
    } catch {}
    try {
      useScrollToDateStore.getState().setScrollToDate(null);
    } catch {}
    this.cellEditor.destroy();
    WorkTrackerDragManager.destroy();
    this.stickyTopLeftCell.destroy();
    this.stickyTopRow.destroy();
    this.stickyLeftColumn.destroy();
    this.mainGridPinnedYAxis.destroy();
    this.mainGrid.destroy();
  }
}
