import { Container, Graphics, Sprite, Text } from "pixi.js";
import { EventSpanType, EventsUtil } from "../../util/Events";
import { CELL_HEIGHT, CELL_WIDTH } from "@/features/dashboard/values/constants";
import { Baker } from "../../util/Baker";
import { BleacherEvent } from "../../types";
import { loadEventById } from "../../db/client/loadEventById";
import { loadMaintenanceEventById } from "../../db/client/loadMaintenanceEventById";
import { supabaseClientRegistry } from "../../util/supabaseClientRegistry";

export class EventBody extends Sprite {
  private currentSpan?: EventSpanType;

  constructor(
    eventInfo: {
      hasEvent: boolean;
      span?: EventSpanType;
      isStart: boolean;
      isEnd: boolean;
      isMiddle: boolean;
    },
    baker: Baker,
    dimensions: { width: number; height: number },
    topOffset: number = CELL_HEIGHT,
  ) {
    super();

    this.currentSpan = eventInfo.span;
    this.eventMode = "static";
    this.cursor = "pointer";

    const borderWidth = 1;
    const alignment = 1;
    const L = 0;

    const R = CELL_WIDTH + 2;
    const B = CELL_HEIGHT + 1;

    const W = CELL_WIDTH + 1;
    const H = CELL_HEIGHT - topOffset;

    this.on("pointerdown", this.handleClick.bind(this));

    const isBooked = !!eventInfo.span?.ev.booked;
    const isMaintenance = !!eventInfo.span?.ev.isMaintenance;
    const hasDamageAlert = !!eventInfo.span?.ev.hasDamageAlert;
    const eventColor = isMaintenance
      ? 0xff0000
      : eventInfo.span && eventInfo.span.ev.hslHue != null
        ? EventsUtil.hslToRgbInt(eventInfo.span.ev.hslHue, 60, 60)
        : 0x808080;

    const texture = baker.getTexture(
      `EventBody:${eventInfo.span?.ev.eventUuid}:${isMaintenance ? "maint" : isBooked ? "booked" : "quoted"}:${
        eventInfo.isStart ? "start" : eventInfo.isEnd ? "end" : "middle"
      }:top${topOffset}${hasDamageAlert ? ":dmg" : ""}`,
      { width: CELL_WIDTH + 2, height: CELL_HEIGHT + 2 },
      // null,
      (c) => {
        const g = new Graphics();
        const fill = new Graphics();

        // const test = new Text({
        //   text: "",
        //   style: {
        //     fontFamily: "Helvetica",
        //     fontSize: 14,
        //     fontWeight: "500",
        //     fill: 0x000000,
        //     align: "left",
        //   },
        // });

        if (isBooked) {
          // Booked events: solid fill
          const T = Math.max(1, topOffset);
          // fill.rect(L, T, W, H).fill(eventColor);
          fill.rect(L, T - 1, W, H).fill(eventColor);

          if (eventInfo.isStart) {
            // Start cell: top, left, and bottom borders
            g.moveTo(L, T)
              .lineTo(R, T)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Top
            g.moveTo(L, T)
              .lineTo(L, B)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Left
            g.moveTo(L, B)
              .lineTo(R, B)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Bottom

            // test.text = "Start";
            // const tileGraphics = new Graphics();

            // Draw tile background (light gray)
          } else if (eventInfo.isEnd) {
            // End cell: top, right, and bottom borders
            const r = R - 2;
            g.moveTo(L, T)
              .lineTo(r + 1, T)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Top
            g.moveTo(r, T)
              .lineTo(r, B)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Right
            g.moveTo(L, B)
              .lineTo(r, B)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Bottom
            // test.text = "End";
          } else {
            // Middle cell: only top and bottom borders
            g.moveTo(L, T)
              .lineTo(R, T)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Top
            g.moveTo(L, B)
              .lineTo(R, B)
              .stroke({ width: borderWidth, color: 0x000000, alpha: 0.2, alignment }); // Bottom
            // test.text = "Middle";
          }

          g.stroke({ alpha: 0.2 });
          fill.rect(L, T, W, H).fill(eventColor);
        } else {
          // Quoted events: white background with selective borders
          const T = Math.max(1, topOffset);
          fill.rect(L, T - 1, W, H).fill(0xffffff); // White background

          // Draw borders based on position in span
          if (eventInfo.isStart) {
            // Start cell: top, left, and bottom borders
            g.moveTo(L, T)
              .lineTo(R, T)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Top
            g.moveTo(L, T)
              .lineTo(L, B)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Left
            g.moveTo(L, B)
              .lineTo(R, B)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Bottom

            // test.text = "Start";
            // const tileGraphics = new Graphics();

            // Draw tile background (light gray)
          } else if (eventInfo.isEnd) {
            // End cell: top, right, and bottom borders
            const r = R - 2;
            g.moveTo(L, T)
              .lineTo(r + 1, T)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Top
            g.moveTo(r, T)
              .lineTo(r, B)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Right
            g.moveTo(L, B)
              .lineTo(r, B)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Bottom
            // test.text = "End";
          } else {
            // Middle cell: only top and bottom borders
            g.moveTo(L, T)
              .lineTo(R, T)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Top
            g.moveTo(L, B)
              .lineTo(R, B)
              .stroke({ width: borderWidth, color: eventColor, alignment }); // Bottom
            // test.text = "Middle";
          }
        }

        c.addChild(fill, g);

        // Damage alert indicator: small warning triangle on start cell
        if (hasDamageAlert && eventInfo.isStart) {
          const triSize = 8;
          const tx = W - triSize - 2;
          const ty = Math.max(2, topOffset + 2);
          const tri = new Graphics();
          tri.moveTo(tx + triSize / 2, ty);
          tri.lineTo(tx + triSize, ty + triSize);
          tri.lineTo(tx, ty + triSize);
          tri.closePath();
          tri.fill(0xdc2626); // red-600
          c.addChild(tri);
        }
        // console.log(
        //   "EventBody",
        //   isBooked ? "booked" : "quoted",
        //   eventInfo.isStart ? "start" : eventInfo.isEnd ? "end" : "middle"
        // );
      },
    );

    this.texture = texture;
  }

  private handleClick() {
    if (!this.currentSpan) return;
    const event = this.currentSpan.ev;
    this.handleLoadEvent(event);
  }

  private async handleLoadEvent(bleacherEvent: BleacherEvent) {
    const supabase = supabaseClientRegistry.getClient();

    if (!supabase) {
      console.warn("No Supabase client available");
      return;
    }

    if (bleacherEvent.isMaintenance) {
      await loadMaintenanceEventById(bleacherEvent.eventUuid, supabase);
    } else {
      await loadEventById(bleacherEvent.eventUuid, supabase);
    }
  }
}
