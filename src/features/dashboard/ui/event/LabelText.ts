import { Container, Text } from "pixi.js";
import { EventSpanType } from "../../util/Events";
import { loadEventForModal } from "@/features/eventConfiguration/functions/loadEventForModal";
import { loadSubrentalEventById } from "../../db/client/loadSubrentalEventById";

/**
 * Static event label component without any interactive elements
 * This can be safely baked into a RenderTexture for performance
 */
export class LabelText extends Container {
  private nameLabel: Text;
  private addressLabel?: Text;
  private eventInfo: EventSpanType;

  constructor(eventInfo: EventSpanType, availableWidth?: number, isAccessible: boolean = true) {
    super();

    this.eventInfo = eventInfo;

    // Make clickable
    this.eventMode = "static";
    this.cursor = "pointer";
    this.on("pointerdown", this.handleClick.bind(this));

    // Determine text color based on booked status
    const isBooked = !!eventInfo.ev.booked;
    const isSubrental = !!eventInfo.ev.isSubrental;
    const eventColor = isSubrental
      ? 0x6366f1 // indigo-500
      : eventInfo.ev.hslHue != null
        ? this.hslToRgbInt(eventInfo.ev.hslHue, isAccessible ? 60 : 20, isAccessible ? 60 : 70)
        : 0x808080;
    const textColor = isBooked && !isSubrental ? 0x000000 : isSubrental ? 0x000000 : eventColor;

    // Event name (main label)
    this.nameLabel = new Text({
      text: isSubrental ? "SUB-RENTAL" : `${eventInfo.ev.eventName}`,
      style: {
        fontFamily: "Helvetica",
        fontSize: 13,
        fontWeight: "500",
        align: "left",
        fill: textColor,
        ...(availableWidth != null && { wordWrap: true, wordWrapWidth: availableWidth }),
      },
    });
    this.nameLabel.position.set(-2, -3);
    this.addChild(this.nameLabel);
  }

  private async handleClick(e: any) {
    // Don't handle if clicking on an interactive child (like GoodShuffleIcon)
    if (e.target !== this && e.target.eventMode === "static") {
      return;
    }

    if (this.eventInfo.ev.isSubrental) {
      await loadSubrentalEventById(this.eventInfo.ev.eventUuid);
      return;
    }

    await loadEventForModal(this.eventInfo.ev.eventUuid, "dashboard");
  }

  /**
   * Convert HSL to RGB integer for text color
   */
  private hslToRgbInt(h: number, s: number, l: number): number {
    const S = s / 100,
      L = l / 100;
    const C = (1 - Math.abs(2 * L - 1)) * S;
    const X = C * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = L - C / 2;
    let r = 0,
      g = 0,
      b = 0;
    if (h < 60) [r, g, b] = [C, X, 0];
    else if (h < 120) [r, g, b] = [X, C, 0];
    else if (h < 180) [r, g, b] = [0, C, X];
    else if (h < 240) [r, g, b] = [0, X, C];
    else if (h < 300) [r, g, b] = [X, 0, C];
    else [r, g, b] = [C, 0, X];
    const R = Math.round((r + m) * 255);
    const G = Math.round((g + m) * 255);
    const B = Math.round((b + m) * 255);
    return (R << 16) | (G << 8) | B;
  }

  /**
   * Get the dimensions needed for positioning additional elements (entire container)
   */
  public getLabelDimensions(): { width: number; height: number } {
    const bounds = this.getBounds();
    return { width: bounds.width, height: bounds.height };
  }

  /**
   * Get the dimensions of just the name label (excluding address)
   */
  public getNameLabelDimensions(): { width: number; height: number } {
    const bounds = this.nameLabel.getBounds();
    return { width: bounds.width, height: bounds.height };
  }
}
