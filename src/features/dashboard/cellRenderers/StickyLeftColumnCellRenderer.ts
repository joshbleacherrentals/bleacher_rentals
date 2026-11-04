import { Application, Container } from "pixi.js";
import { ICellRenderer } from "../interfaces/ICellRenderer";
import { BleacherCell } from "../ui/BleacherCell";
import { Tile } from "../ui/Tile";
import { Baker } from "../util/Baker";
import { EventLeftColumnCell } from "../ui/EventLeftColumnCell";
import { Bleacher, DashboardEvent } from "../types";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";
import { useBleacherLocationModalStore } from "../state/useBleacherLocationModalStore";
import { useSwapStore } from "../state/useSwapStore";
import { useDashboardBleachersStore } from "../state/useDashboardBleachersStore";
import { computeAffectedSwaps } from "../db/client/swapBleacherEvents";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { isBleacherAccessible } from "../ui/NoAccessFilter";
import { createErrorToastNoThrow } from "@/components/toasts/ErrorToast";
import { isBleacherOwnedByAM } from "@/features/userAccess/logic/isBleacherOwnedByAM";
import {
  isSubrentedOutDuringRange,
  hasSubrentalAccessForRange,
} from "@/features/userAccess/logic/hasSubrentalAccessForDate";
import { resolveSubrentalConstraint } from "../ui/event/EventBody";
import { canEditEvent } from "@/features/userAccess/logic/canEditEvent";
import { setEventBleacherLinked } from "@/features/eventConfiguration/functions/saveEventPanelChange";
import { triage } from "@/features/alerts/triage";
import { supabaseClientRegistry } from "../util/supabaseClientRegistry";

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
  private unsubSubrental?: () => void;
  private unsubPermissions?: () => void;
  private isFormExpanded = false;
  private isMaintenanceFormExpanded = false;
  private selectedBleacherUuids: string[] = [];
  // Whether the +/– on each bleacher row is drawn. It follows `isFormExpanded`, except that the
  // event panel shows it only to someone who may change that event (D9 of
  // docs/specs/dashboard-events-read-only.md). Swap keeps following `isFormExpanded` alone.
  private toggleShown = false;

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
    const sr = useSubrentalEventStore.getState();
    this.isFormExpanded = !!st.isFormExpanded || !!mt.isFormExpanded || !!sr.isFormExpanded;
    this.isMaintenanceFormExpanded = !!mt.isFormExpanded;
    this.selectedBleacherUuids =
      sr.isFormExpanded && sr.bleacherUuid
        ? [sr.bleacherUuid]
        : mt.isFormExpanded
          ? mt.bleacherUuids.slice()
          : st.bleacherUuids.slice();

    this.toggleShown = this.computeToggleShown();

    // Helper to apply expand/select changes to all cells
    const applyChanges = (
      expandedChanged: boolean,
      selectedChanged: boolean,
      toggleChanged = false,
    ) => {
      const ticker = (this.app as any)?.ticker;
      const doUpdate = () => {
        for (const [row, cell] of this.cellPool.entries()) {
          if (expandedChanged || toggleChanged) {
            cell.setFormExpanded(this.toggleShown);
          }
          if (expandedChanged && !this.isFormExpanded) {
            useSwapStore.getState().reset();
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
      const toggleChanged = this.refreshToggleShown();
      if (!expandedChanged && !selectedChanged && !toggleChanged) return;
      if (expandedChanged) this.isFormExpanded = anyExpanded;
      if (selectedChanged) this.selectedBleacherUuids = s.bleacherUuids.slice();
      applyChanges(expandedChanged, selectedChanged, toggleChanged);
    });

    this.unsubMaintenance = useMaintenanceEventStore.subscribe((s) => {
      this.isMaintenanceFormExpanded = !!s.isFormExpanded;
      const eventExpanded = useCurrentEventStore.getState().isFormExpanded;
      const srExpanded = useSubrentalEventStore.getState().isFormExpanded;
      const anyExpanded = eventExpanded || s.isFormExpanded || srExpanded;
      const expandedChanged = anyExpanded !== this.isFormExpanded;
      // Track maintenance bleacherUuids when maintenance form is active
      const selectedChanged = s.isFormExpanded && s.bleacherUuids !== this.selectedBleacherUuids;
      const toggleChanged = this.refreshToggleShown();
      if (!expandedChanged && !selectedChanged && !toggleChanged) return;
      if (expandedChanged) this.isFormExpanded = anyExpanded;
      if (selectedChanged) this.selectedBleacherUuids = s.bleacherUuids.slice();
      applyChanges(expandedChanged, selectedChanged, toggleChanged);
    });

    this.unsubSubrental = useSubrentalEventStore.subscribe((s) => {
      const eventExpanded = useCurrentEventStore.getState().isFormExpanded;
      const mtExpanded = useMaintenanceEventStore.getState().isFormExpanded;
      const anyExpanded = eventExpanded || mtExpanded || s.isFormExpanded;
      const expandedChanged = anyExpanded !== this.isFormExpanded;
      // Single-select: always derive from store, including null (deselect)
      const newSelected = s.isFormExpanded ? (s.bleacherUuid ? [s.bleacherUuid] : []) : [];
      const selectedChanged =
        s.isFormExpanded &&
        (newSelected.length !== this.selectedBleacherUuids.length ||
          newSelected[0] !== this.selectedBleacherUuids[0]);
      const toggleChanged = this.refreshToggleShown();
      if (!expandedChanged && !selectedChanged && !toggleChanged) return;
      if (expandedChanged) this.isFormExpanded = anyExpanded;
      if (selectedChanged) this.selectedBleacherUuids = newSelected;
      applyChanges(expandedChanged, selectedChanged, toggleChanged);
    });

    // The roles reach the store after sign-in, and an event panel may already be open by then.
    this.unsubPermissions = usePermissionsStore.subscribe(() => {
      if (this.refreshToggleShown()) applyChanges(false, false, true);
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
   * May the signed-in user change the event the panel holds? The same answer the panel's palette
   * button uses (`canEditEvent`).
   */
  private canEditOpenEvent(): boolean {
    const perms = usePermissionsStore.getState();
    const st = useCurrentEventStore.getState();
    const all = useDashboardBleachersStore.getState().data;
    const eventBleacherZoneIds = st.bleacherUuids
      .map((id) => all.find((b) => b.bleacherUuid === id && !b.isSubrentalRow)?.zoneUuid)
      .filter((z): z is string => !!z);

    return canEditEvent({
      isAdmin: perms.isAdmin,
      isAccountManager: perms.isAccountManager,
      accountManagerZoneIds: perms.accountManagerZoneIds,
      leadZoneIds: perms.leadZoneIds,
      userId: perms.userId,
      originalOwnerUserUuid: st.originalOwnerUserUuid,
      eventBleacherZoneIds,
    });
  }

  /** Are the +/– on the bleacher rows drawn right now? */
  private computeToggleShown(): boolean {
    // The maintenance and sub-rental forms keep their own behaviour.
    if (useMaintenanceEventStore.getState().isFormExpanded) return true;
    if (useSubrentalEventStore.getState().isFormExpanded) return true;
    if (!useCurrentEventStore.getState().isFormExpanded) return false;
    return this.canEditOpenEvent();
  }

  /** Recompute `toggleShown`; true when it changed. */
  private refreshToggleShown(): boolean {
    const next = this.computeToggleShown();
    if (next === this.toggleShown) return false;
    this.toggleShown = next;
    return true;
  }

  /**
   * Writes one +/– click of the event panel, then re-checks the event's alerts, as Update did.
   * The grid already shows the change; a failed write puts the bleacher back.
   */
  private async saveEventBleacher(eventUuid: string, bleacherUuid: string, linked: boolean) {
    try {
      await setEventBleacherLinked({ eventUuid, bleacherUuid, linked });
    } catch (error) {
      console.error("Failed to save the bleacher change:", error);
      const now = useCurrentEventStore.getState();
      if (now.eventUuid === eventUuid) {
        const has = now.bleacherUuids.includes(bleacherUuid);
        if (linked && has) {
          now.setField(
            "bleacherUuids",
            now.bleacherUuids.filter((n) => n !== bleacherUuid),
          );
        } else if (!linked && !has) {
          now.setField("bleacherUuids", [...now.bleacherUuids, bleacherUuid]);
        }
      }
      createErrorToastNoThrow([
        linked
          ? "Could not add the bleacher to the event. It was taken off again."
          : "Could not take the bleacher off the event. It was put back.",
      ]);
      return;
    }

    try {
      await triage(
        "Events",
        linked ? { id: eventUuid } : { id: eventUuid, removed_bleacher_uuids: [bleacherUuid] },
        supabaseClientRegistry.getClient() ?? undefined,
      );
    } catch (error) {
      // The bleacher change is saved; the alerts catch up with the next change.
      console.error("Failed to re-check the event's alerts:", error);
    }
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
        const perms = usePermissionsStore.getState();

        // Viewer cannot toggle bleachers at all
        if (!perms.isAdmin && !perms.isAccountManager) return;

        // Subrental form: single-select — last click wins, deselect others
        const sr = useSubrentalEventStore.getState();
        if (sr.isFormExpanded) {
          const next = sr.bleacherUuid === id ? null : id;
          sr.setField("bleacherUuid", next);
          sr.setField("status", "pending");
          return;
        }

        const mt = useMaintenanceEventStore.getState();
        if (mt.isFormExpanded) {
          if (perms.isAccountManager && !perms.isAdmin) {
            const allBleachers = useDashboardBleachersStore.getState().data;
            const bleacher = allBleachers.find((b) => b.bleacherUuid === id && !b.isSubrentalRow);
            const ownedByAM = isBleacherOwnedByAM({
              bleacherZoneUuid: bleacher?.zoneUuid,
              accountManagerZoneIds: perms.accountManagerZoneIds,
            });
            const subrented = isSubrentedOutDuringRange({
              bleacher,
              eventStart: mt.eventStart,
              eventEnd: mt.eventEnd,
            });
            const hasBorrowedAccess = hasSubrentalAccessForRange({
              bleacherUuid: id,
              eventStart: mt.eventStart,
              eventEnd: mt.eventEnd,
              accountManagerZoneIds: perms.accountManagerZoneIds,
              allBleachers,
            });
            if ((!ownedByAM || subrented) && !hasBorrowedAccess) {
              createErrorToastNoThrow([
                ownedByAM && subrented
                  ? "This bleacher is subrented out during this date range."
                  : "This bleacher is not assigned to you.",
              ]);
              return;
            }
          }
          const selected = mt.bleacherUuids;
          const updated = selected.includes(id)
            ? selected.filter((n) => n !== id)
            : [...selected, id];
          mt.setField("bleacherUuids", updated);
          mt.setField(
            "subrentalConstraint",
            resolveSubrentalConstraint(updated, mt.eventStart, mt.eventEnd),
          );
          return;
        }
        const st = useCurrentEventStore.getState();
        if (!st.isFormExpanded || !st.eventUuid) return;

        // The +/– is hidden from anyone without the right; this is the second lock.
        if (!this.canEditOpenEvent()) return;

        // Part 3: AM may unassign a bleacher they don't own, but may not assign
        // one. Only gate the assign direction (bleacher not yet on the event).
        const isAssigning = !st.bleacherUuids.includes(id);

        if (perms.isAccountManager && !perms.isAdmin && isAssigning) {
          const allBleachers = useDashboardBleachersStore.getState().data;
          const bleacher = allBleachers.find((b) => b.bleacherUuid === id && !b.isSubrentalRow);
          const ownedByAM = isBleacherOwnedByAM({
            bleacherZoneUuid: bleacher?.zoneUuid,
            accountManagerZoneIds: perms.accountManagerZoneIds,
          });
          const subrented = isSubrentedOutDuringRange({
            bleacher,
            eventStart: st.eventStart,
            eventEnd: st.eventEnd,
          });
          const hasBorrowedAccess = hasSubrentalAccessForRange({
            bleacherUuid: id,
            eventStart: st.eventStart,
            eventEnd: st.eventEnd,
            accountManagerZoneIds: perms.accountManagerZoneIds,
            allBleachers,
          });
          if ((!ownedByAM || subrented) && !hasBorrowedAccess) {
            createErrorToastNoThrow([
              ownedByAM && subrented
                ? "This bleacher is subrented out during this date range."
                : "This bleacher is not assigned to you.",
            ]);
            return;
          }
        }

        // Saved at once (D1). The grid shows the change now; a failed write puts it back.
        const selected = st.bleacherUuids;
        const updated = selected.includes(id)
          ? selected.filter((n) => n !== id)
          : [...selected, id];
        st.setField("bleacherUuids", updated);
        void this.saveEventBleacher(st.eventUuid, id, isAssigning);
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
      cell.setFormExpanded(this.toggleShown);
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
      cell.setBleacher(bleacher, isBleacherAccessible(bleacher));
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
    try {
      this.unsubSubrental?.();
    } catch {}
    try {
      this.unsubPermissions?.();
    } catch {}
    this.unsub = undefined;
    this.unsubSwap = undefined;
    this.unsubMaintenance = undefined;
    this.unsubSubrental = undefined;
    this.unsubPermissions = undefined;
    this.cellPool.clear();
    this.baker.destroyAll();
  }
}
