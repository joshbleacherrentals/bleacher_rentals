import { Application, Container } from "pixi.js";
import { ICellRenderer } from "../interfaces/ICellRenderer";
import { BleacherCell } from "../ui/BleacherCell";
import { Tile } from "../ui/Tile";
import { Baker } from "../util/Baker";
import { EventLeftColumnCell } from "../ui/EventLeftColumnCell";
import { Bleacher, DashboardEvent } from "../types";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useBleacherLocationModalStore } from "../state/useBleacherLocationModalStore";
import { useSwapStore } from "../state/useSwapStore";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { computeAffectedSwaps } from "../db/client/swapBleacherEvents";

/**
 * CellRenderer for the sticky left column that displays bleacher information
 * Uses BleacherCell component to show bleacher details in each row
 *
 * This renderer creates BleacherCell instances that display real bleacher data
 * The Grid handles automatic baking and caching for performance
 */
export class StickyLeftColumnCellRenderer implements ICellRenderer {
  private app: Application;
  private baker: Baker;
  private bleachers: Bleacher[];

  // Maintain a pool keyed by row index so per-row toggle state can persist across rebuilds
  private cellPool: Map<number, BleacherCell> = new Map();
  private unsub?: () => void;
  private unsubSwap?: () => void;
  private unsubMaintenance?: () => void;
  private isFormExpanded = false;
  private isMaintenanceFormExpanded = false;
  private selectedBleacherUuids: string[] = [];

  private yAxis: "Bleachers" | "Events" = "Bleachers";
  private events: DashboardEvent[];

  constructor(
    app: Application,
    bleachers: Bleacher[],
    yAxis: "Bleachers" | "Events",
    events: DashboardEvent[],
  ) {
    this.app = app;
    this.baker = new Baker(app);
    this.bleachers = bleachers;
    this.yAxis = yAxis;
    this.events = events;
    this.bootstrapStateSync();
  }

  private bootstrapStateSync() {
    const st = useCurrentEventStore.getState();
    const mt = useMaintenanceEventStore.getState();
    this.isFormExpanded = !!st.isFormExpanded || !!mt.isFormExpanded;
    this.isMaintenanceFormExpanded = !!mt.isFormExpanded;
    this.selectedBleacherUuids = mt.isFormExpanded
      ? mt.bleacherUuids.slice()
      : st.bleacherUuids.slice();

    // Helper to apply expand/select changes to all cells
    const applyChanges = (expandedChanged: boolean, selectedChanged: boolean) => {
      const ticker = (this.app as any)?.ticker;
      const doUpdate = () => {
        for (const [row, cell] of this.cellPool.entries()) {
          if (expandedChanged) {
            cell.setFormExpanded(this.isFormExpanded);
            if (!this.isFormExpanded) {
              useSwapStore.getState().reset();
            }
          }
          if (selectedChanged) {
            const b = this.bleachers[row];
            if (b) cell.setSelected(this.selectedBleacherUuids.includes(b.bleacherUuid));
          }
        }
        this.updateSwapButtons();
      };
      if (ticker && typeof ticker.addOnce === "function") {
        ticker.addOnce(doUpdate);
      } else {
        doUpdate();
      }
    };

    this.unsub = useCurrentEventStore.subscribe((s) => {
      const anyExpanded = s.isFormExpanded || this.isMaintenanceFormExpanded;
      const expandedChanged = anyExpanded !== this.isFormExpanded;
      // Only track event bleacherUuids when event form is the active one
      const selectedChanged =
        !this.isMaintenanceFormExpanded && s.bleacherUuids !== this.selectedBleacherUuids;
      if (!expandedChanged && !selectedChanged) return;
      if (expandedChanged) this.isFormExpanded = anyExpanded;
      if (selectedChanged) this.selectedBleacherUuids = s.bleacherUuids.slice();
      applyChanges(expandedChanged, selectedChanged);
    });

    this.unsubMaintenance = useMaintenanceEventStore.subscribe((s) => {
      this.isMaintenanceFormExpanded = !!s.isFormExpanded;
      const eventExpanded = useCurrentEventStore.getState().isFormExpanded;
      const anyExpanded = eventExpanded || s.isFormExpanded;
      const expandedChanged = anyExpanded !== this.isFormExpanded;
      // Track maintenance bleacherUuids when maintenance form is active
      const selectedChanged = s.isFormExpanded && s.bleacherUuids !== this.selectedBleacherUuids;
      if (!expandedChanged && !selectedChanged) return;
      if (expandedChanged) this.isFormExpanded = anyExpanded;
      if (selectedChanged) this.selectedBleacherUuids = s.bleacherUuids.slice();
      applyChanges(expandedChanged, selectedChanged);
    });

    // Subscribe to swap store for UI updates
    this.unsubSwap = useSwapStore.subscribe(() => {
      const ticker = (this.app as any)?.ticker;
      if (ticker && typeof ticker.addOnce === "function") {
        ticker.addOnce(() => this.updateSwapButtons());
      } else {
        this.updateSwapButtons();
      }
    });
  }

  /**
   * Compute the swap button state for a single bleacher given current store state.
   */
  private getSwapStateForBleacher(
    bleacher: Bleacher | undefined,
  ): "default" | "selected" | "prominent" | "hidden" {
    if (!bleacher) return "hidden";
    const swapState = useSwapStore.getState();
    const eventState = useCurrentEventStore.getState();
    const currentEventUuid = eventState.eventUuid;

    if (!this.isFormExpanded || !currentEventUuid) return "hidden";

    const bleacherHasCurrentEvent = bleacher.bleacherEvents.some(
      (e) => e.eventUuid === currentEventUuid,
    );

    if (swapState.mode === "idle") {
      return "default";
    } else if (swapState.mode === "selecting") {
      if (bleacher.bleacherUuid === swapState.firstBleacherUuid) {
        return "selected";
      } else if (swapState.firstHasCurrentEvent) {
        return bleacherHasCurrentEvent ? "hidden" : "prominent";
      } else {
        return bleacherHasCurrentEvent ? "prominent" : "hidden";
      }
    }
    // confirming mode
    return "hidden";
  }

  /**
   * Apply swap state to a single cell (used on initial creation).
   */
  private applySwapStateToCell(cell: BleacherCell, bleacher: Bleacher | undefined) {
    cell.setSwapState(this.getSwapStateForBleacher(bleacher));
  }

  /**
   * Update swap button states across all visible cells based on current swap/event state.
   */
  private updateSwapButtons() {
    for (const [row, cell] of this.cellPool.entries()) {
      const bleacher = this.bleachers[row];
      cell.setSwapState(this.getSwapStateForBleacher(bleacher));
    }
  }

  private getOrCreateCell(row: number): BleacherCell {
    let cell = this.cellPool.get(row);
    if (!cell) {
      cell = new BleacherCell(this.baker);
      const bleacher = this.bleachers[row];
      if (bleacher) cell.setBleacher(bleacher);

      // Wire toggle handler - routes to event or maintenance store
      cell.setToggleHandler((id) => {
        const mt = useMaintenanceEventStore.getState();
        if (mt.isFormExpanded) {
          const selected = mt.bleacherUuids;
          const updated = selected.includes(id)
            ? selected.filter((n) => n !== id)
            : [...selected, id];
          mt.setField("bleacherUuids", updated);
          return;
        }
        const st = useCurrentEventStore.getState();
        if (!st.isFormExpanded) return;
        const selected = st.bleacherUuids;
        const updated = selected.includes(id)
          ? selected.filter((n) => n !== id)
          : [...selected, id];
        st.setField("bleacherUuids", updated);
      });

      // Wire map pin click handler
      cell.setMapPinClickHandler((id) => {
        const bleacher = this.bleachers.find((b) => b.bleacherUuid === id);
        if (bleacher && bleacher.linxupDeviceId) {
          const modalStore = useBleacherLocationModalStore.getState();
          modalStore.openModal(
            bleacher.bleacherNumber,
            bleacher.bleacherUuid,
            bleacher.linxupDeviceId,
          );
        }
      });

      // Wire swap handler
      cell.setSwapHandler((bleacherUuid) => {
        const eventState = useCurrentEventStore.getState();
        const currentEventUuid = eventState.eventUuid;
        if (!currentEventUuid || !eventState.isFormExpanded) return;

        const swapState = useSwapStore.getState();
        const bl = this.bleachers.find((b) => b.bleacherUuid === bleacherUuid);
        if (!bl) return;

        const hasCurrentEvent = bl.bleacherEvents.some((e) => e.eventUuid === currentEventUuid);

        if (swapState.mode === "idle") {
          // First selection
          swapState.selectFirst(bleacherUuid, hasCurrentEvent);
        } else if (swapState.mode === "selecting") {
          if (bleacherUuid === swapState.firstBleacherUuid) {
            // Deselect - go back to idle
            swapState.reset();
            return;
          }

          // Second selection - compute affected swaps and open modal
          const allBleachers = useDashboardBleachersStore.getState().data;
          const sourceBleacherUuid = swapState.firstHasCurrentEvent
            ? swapState.firstBleacherUuid!
            : bleacherUuid;
          const targetBleacherUuid = swapState.firstHasCurrentEvent
            ? bleacherUuid
            : swapState.firstBleacherUuid!;

          const swaps = computeAffectedSwaps(
            sourceBleacherUuid,
            targetBleacherUuid,
            currentEventUuid,
            allBleachers,
          );

          swapState.confirmSecond(bleacherUuid, swaps);
        }
      });

      // Initial state application
      cell.setFormExpanded(this.isFormExpanded);
      if (bleacher) cell.setSelected(this.selectedBleacherUuids.includes(bleacher.bleacherUuid));
      // Apply initial swap button state for this cell
      this.applySwapStateToCell(cell, bleacher);
      this.cellPool.set(row, cell);
    }
    return cell;
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
  ): Container {
    parent.removeChildren();

    const dimensions = { width: cellWidth, height: cellHeight };
    if (this.yAxis === "Events") {
      const event = this.events[row];
      if (event) {
        const cell = new EventLeftColumnCell(dimensions, this.baker, event);
        parent.addChild(cell);
        return parent;
      }
    }

    const tileSprite = new Tile(dimensions, this.baker, row, col);
    parent.addChild(tileSprite);

    const bleacher = this.bleachers[row];
    if (bleacher) {
      const cell = this.getOrCreateCell(row);
      // Ensure bleacher data is up to date (in case data changed externally)
      cell.setBleacher(bleacher);
      parent.addChild(cell);
    }
    return parent;
  }

  /**
   * Clean up resources
   */
  destroy() {
    try {
      this.unsub?.();
    } catch {}
    try {
      this.unsubSwap?.();
    } catch {}
    try {
      this.unsubMaintenance?.();
    } catch {}
    this.unsub = undefined;
    this.unsubSwap = undefined;
    this.unsubMaintenance = undefined;
    this.cellPool.clear();
    this.baker.destroyAll();
  }
}
