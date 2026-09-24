import { Container, Text, Graphics, Application } from "pixi.js";
import { EventSpanType } from "../../util/Events";
import { LabelText } from "./LabelText";
import { GoodShuffleIcon } from "./GoodShuffleIcon";
import { AlertBadge } from "./AlertBadge";
import { Baker } from "../../util/Baker";
import { loadEventForModal } from "@/features/eventConfiguration/functions/loadEventForModal";

/**
 * Event cell label that can render in different modes for optimal caching
 * - static: Just text, can be fully baked
 * - dynamic: Text + static triangle, can be baked as unit
 * - separated: Text baked separately, triangle rendered live for animation
 */
export class PinnableSection extends Container {
  private labelText: LabelText;
  private eventInfo: EventSpanType;

  constructor(
    eventInfo: EventSpanType,
    app: Application,
    baker: Baker,
    availableWidth?: number,
    isAccessible: boolean = true,
  ) {
    super();
    this.position.set(4, 4);

    this.eventInfo = eventInfo;

    // Make clickable
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", this.handleClick.bind(this));

    // Always create the static label
    this.labelText = new LabelText(eventInfo, availableWidth, isAccessible);
    const labelDimensions = this.labelText.getNameLabelDimensions();
    let nextX = labelDimensions.width + 4;

    if (eventInfo.ev.goodshuffleUrl) {
      const gsLogo = new GoodShuffleIcon(baker, eventInfo.ev.goodshuffleUrl);
      gsLogo.position.set(nextX, 0);
      this.addChild(gsLogo);
      nextX += 20;
    }

    // Damage is shown by the red cell overlay (damageOverlayRanges), not by this badge: a damaged
    // bleacher used to add +1 here, so an event with no alert at all still wore one and there was
    // nothing to open in the event form.
    const alertCount = eventInfo.ev.alertCount ?? 0;
    if (alertCount > 0) {
      const badge = new AlertBadge(baker, alertCount);
      badge.position.set(nextX, 0);
      this.addChild(badge);
    }

    this.addChild(this.labelText);

    // console.log("PinnableSection");
  }

  private async handleClick(e: any) {
    // Don't handle if clicking on an interactive child (like GoodShuffleIcon)
    // Check if the target or any parent is an interactive element
    let target = e.target;
    while (target && target !== this) {
      if (target.eventMode === "static" && target !== this.labelText) {
        return; // Let the child handle it
      }
      target = target.parent;
    }

    await loadEventForModal(this.eventInfo.ev.eventUuid, "dashboard");
  }

  /**
   * Clean up resources
   */
  destroy(options?: Parameters<Container["destroy"]>[0]) {
    // Clean up hover event listeners
    this.off("pointerenter");
    this.off("pointerleave");

    // Logo will be cleaned up automatically if it's a child
    super.destroy(options);
  }
}
