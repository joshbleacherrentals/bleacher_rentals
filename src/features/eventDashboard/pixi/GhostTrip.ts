import { Container, Graphics, Text } from "pixi.js";
import { CELL_HEIGHT, CELL_WIDTH } from "@/features/dashboard/values/constants";
import type { SuggestedTrip } from "../utils/suggestions";

/**
 * A suggested work tracker: dashed-looking orange tile that flashes. Clicking it accepts the trip.
 * The flashing is done by `GhostPulse`, which owns the ticker.
 */
export class GhostTrip extends Container {
  constructor(
    readonly trip: SuggestedTrip,
    onAccept: (trip: SuggestedTrip) => void,
  ) {
    super();
    const w = CELL_WIDTH - 6;
    const h = CELL_HEIGHT - 6;

    const body = new Graphics()
      .roundRect(0, 0, w, h, 4)
      .fill({ color: 0xfb923c, alpha: 0.35 })
      .stroke({ width: 2, color: 0xea580c, alpha: 0.9 });
    const label = new Text({
      text: `Accept\n→ ${shorten(trip.toStreet, 11)}`,
      style: {
        fontSize: 9,
        fontWeight: "700",
        fill: 0x7c2d12,
        align: "center",
        fontFamily: "Helvetica",
      },
    });
    label.anchor.set(0.5);
    label.position.set(w / 2, h / 2);
    this.addChild(body, label);
    this.position.set(3, 3);

    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointertap", (e) => {
      e.stopPropagation();
      onAccept(trip);
    });
  }
}

function shorten(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

/** Makes every live ghost flash. Ghosts that have been removed or destroyed are forgotten. */
export class GhostPulse {
  private ghosts = new Set<GhostTrip>();
  private elapsedMs = 0;
  private readonly tick = (ticker: { deltaMS: number }) => {
    this.elapsedMs += ticker.deltaMS;
    const alpha = 0.55 + 0.45 * Math.sin(this.elapsedMs / 220);
    for (const ghost of this.ghosts) {
      if (ghost.destroyed || !ghost.parent) {
        this.ghosts.delete(ghost);
        continue;
      }
      ghost.alpha = alpha;
    }
  };

  constructor(
    private readonly ticker: {
      add: (fn: (t: { deltaMS: number }) => void) => void;
      remove: (fn: (t: { deltaMS: number }) => void) => void;
    },
  ) {
    ticker.add(this.tick);
  }

  track(ghost: GhostTrip) {
    this.ghosts.add(ghost);
  }

  destroy() {
    this.ticker.remove(this.tick);
    this.ghosts.clear();
  }
}
