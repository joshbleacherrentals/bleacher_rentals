import { Container, Graphics, Sprite } from "pixi.js";
import { EventSpanType, EventsUtil } from "../../util/Events";
import { CELL_HEIGHT, CELL_WIDTH, SUBRENTAL_COLOR } from "@/features/dashboard/values/constants";
import { Baker } from "../../util/Baker";
import { BleacherEvent } from "../../types";
import { loadEventForModal } from "@/features/eventConfiguration/functions/loadEventForModal";
import { loadMaintenanceEventById } from "../../db/client/loadMaintenanceEventById";
import { loadSubrentalEventById } from "../../db/client/loadSubrentalEventById";
import { supabaseClientRegistry } from "../../util/supabaseClientRegistry";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { useDashboardBleachersStore } from "../../state/useDashboardBleachersStore";

/**
 * Looks up the accepted subrental date range that covers the given event window,
 * by checking subrental rows in the dashboard bleachers store.
 * Returns null if the event is not on a subrental row or no matching range exists.
 */
export function resolveSubrentalConstraint(
  bleacherUuids: string[],
  eventStart: string,
  eventEnd: string,
): { eventStart: string; eventEnd: string } | null {
  if (!bleacherUuids.length || !eventStart || !eventEnd) return null;
  const allBleachers = useDashboardBleachersStore.getState().data;
  for (const b of allBleachers) {
    if (!b.isSubrentalRow || !bleacherUuids.includes(b.bleacherUuid)) continue;
    const match = (b.acceptedSubrentalAccess ?? []).find(
      (r) =>
        r.eventStart.substring(0, 10) <= eventEnd.substring(0, 10) &&
        r.eventEnd.substring(0, 10) >= eventStart.substring(0, 10),
    );
    if (match) {
      return {
        eventStart: match.eventStart.substring(0, 10),
        eventEnd: match.eventEnd.substring(0, 10),
      };
    }
  }
  return null;
}

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
    isAccessible: boolean = true,
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
    const isSubrental = !!eventInfo.span?.ev.isSubrental;
    const eventColor = isSubrental
      ? SUBRENTAL_COLOR
      : isMaintenance
        ? 0xff0000
        : eventInfo.span && eventInfo.span.ev.hslHue != null
          ? EventsUtil.hslToRgbInt(
              eventInfo.span.ev.hslHue,
              isAccessible ? 60 : 20,
              isAccessible ? 60 : 70,
            )
          : 0x808080;

    const texture = baker.getTexture(
      `EventBody:${eventInfo.span?.ev.eventUuid}:${isSubrental ? "subrental" : isMaintenance ? "maint" : isBooked ? "booked" : "quoted"}:${
        eventInfo.isStart ? "start" : eventInfo.isEnd ? "end" : "middle"
      }:top${topOffset}:${isAccessible ? "acc" : "noacc"}`,
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
          if (!isAccessible) {
            fill.rect(L, T - 1, W, H).fill({ color: 0x000000, alpha: 0.05 });
          }

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

    if (bleacherEvent.isSubrental) {
      await loadSubrentalEventById(bleacherEvent.eventUuid);
    } else if (bleacherEvent.isMaintenance) {
      await loadMaintenanceEventById(bleacherEvent.eventUuid, supabase);
      const ms = useMaintenanceEventStore.getState();
      ms.setField(
        "subrentalConstraint",
        resolveSubrentalConstraint(ms.bleacherUuids, ms.eventStart, ms.eventEnd),
      );
    } else {
      await loadEventForModal(bleacherEvent.eventUuid, "dashboard");
      const es = useCurrentEventStore.getState();
      es.setField(
        "subrentalConstraint",
        resolveSubrentalConstraint(es.bleacherUuids, es.eventStart, es.eventEnd),
      );
    }
  }
}
