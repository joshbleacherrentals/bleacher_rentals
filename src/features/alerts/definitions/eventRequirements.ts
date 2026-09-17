"use client";

import { AlertDefinition, AlertPayload, InMemoryAlertContext } from "../types";
import { eventEntityDescription } from "../util/eventEntityDescription";
import { db } from "@/components/providers/SystemProvider";
import { expect, typedGetAll } from "@/lib/powersync/typedQuery";

const TITLE = "Event Requirements Not Met";

type EventRow = {
  event_name: string | null;
  total_seats: number | null;
  seven_row: number | null;
  ten_row: number | null;
  fifteen_row: number | null;
  lenient: number | null;
  street: string | null;
  created_by_user_uuid: string | null;
};

type AssignedBleacherRow = {
  bleacher_seats: number | null;
  bleacher_rows: number | null;
  bleacher_type_uuid: string | null;
};

type LineItemRow = {
  bleacher_type_uuid: string | null;
  quantity: number | null;
  type_name: string | null;
};

export const eventRequirements: AlertDefinition = {
  title: TITLE,
  entityType: "event",

  async evaluate(eventUuid, _supabase) {
    console.log("[QUOTE_TRIAGE] eventRequirements.evaluate called for", eventUuid);
    const eventRows = await typedGetAll(
      db
        .selectFrom("Events as e")
        .leftJoin("Addresses as a", "a.id", "e.address_uuid")
        .select([
          "e.event_name as event_name",
          "e.total_seats as total_seats",
          "e.seven_row as seven_row",
          "e.ten_row as ten_row",
          "e.fifteen_row as fifteen_row",
          "e.lenient as lenient",
          "a.street as street",
          "e.created_by_user_uuid as created_by_user_uuid",
        ])
        .where("e.id", "=", eventUuid)
        .where("e.deleted", "=", 0)
        .limit(1)
        .compile(),
      expect<EventRow>(),
    );

    const event = eventRows[0];
    console.log(
      "[QUOTE_TRIAGE] eventRequirements event:",
      event ? JSON.stringify(event) : "NOT FOUND",
    );
    if (!event) return null;

    const assignedRows = await typedGetAll(
      db
        .selectFrom("BleacherEvents as be")
        .innerJoin("Bleachers as b", "b.id", "be.bleacher_uuid")
        .select([
          "b.bleacher_seats as bleacher_seats",
          "b.bleacher_rows as bleacher_rows",
          "b.bleacher_type_uuid as bleacher_type_uuid",
        ])
        .where("be.event_uuid", "=", eventUuid)
        .compile(),
      expect<AssignedBleacherRow>(),
    );

    const entityDescription = [event.event_name, event.street].filter(Boolean).join(" — ") || null;

    let message: string | null = null;

    if (event.lenient) {
      if (!event.total_seats) return null;
      const totalAssignedSeats = assignedRows.reduce((sum, b) => sum + (b.bleacher_seats ?? 0), 0);
      if (totalAssignedSeats !== event.total_seats) {
        message = `Seat mismatch: ${event.total_seats} required, ${totalAssignedSeats} assigned.`;
      }
    } else {
      const lineItems = await typedGetAll(
        db
          .selectFrom("EventLineItems as li")
          .leftJoin("BleacherTypes as bt", "bt.id", "li.bleacher_type_uuid")
          .select([
            "li.bleacher_type_uuid as bleacher_type_uuid",
            "li.quantity as quantity",
            "bt.name as type_name",
          ])
          .where("li.event_uuid", "=", eventUuid)
          .where("li.deleted", "=", 0)
          .compile(),
        expect<LineItemRow>(),
      );
      console.log(
        "[QUOTE_TRIAGE] eventRequirements lineItems:",
        lineItems.length,
        lineItems.map((li) => `${li.type_name}:qty${li.quantity}:bt${li.bleacher_type_uuid}`),
      );
      console.log(
        "[QUOTE_TRIAGE] eventRequirements assignedBleachers:",
        assignedRows.length,
        assignedRows.map((b) => `type${b.bleacher_type_uuid}:rows${b.bleacher_rows}`),
      );

      if (lineItems.length > 0) {
        const mismatches: string[] = [];
        for (const item of lineItems) {
          if (!item.bleacher_type_uuid || !item.quantity) continue;
          const assigned = assignedRows.filter(
            (b) => b.bleacher_type_uuid === item.bleacher_type_uuid,
          ).length;
          if (assigned !== item.quantity) {
            mismatches.push(
              `${item.type_name ?? "Unknown"}: ${item.quantity} needed, ${assigned} assigned`,
            );
          }
        }
        if (mismatches.length > 0) {
          message = `Bleacher mismatch — ${mismatches.join(", ")}.`;
        }
      } else {
        // Legacy fallback
        const sevenRowRequired = event.seven_row ?? 0;
        const tenRowRequired = event.ten_row ?? 0;
        const fifteenRowRequired = event.fifteen_row ?? 0;

        const sevenRowAssigned = assignedRows.filter((b) => b.bleacher_rows === 7).length;
        const tenRowAssigned = assignedRows.filter((b) => b.bleacher_rows === 10).length;
        const fifteenRowAssigned = assignedRows.filter((b) => b.bleacher_rows === 15).length;

        const mismatches: string[] = [];
        if (sevenRowAssigned !== sevenRowRequired)
          mismatches.push(`7-row: ${sevenRowRequired} needed, ${sevenRowAssigned} assigned`);
        if (tenRowAssigned !== tenRowRequired)
          mismatches.push(`10-row: ${tenRowRequired} needed, ${tenRowAssigned} assigned`);
        if (fifteenRowAssigned !== fifteenRowRequired)
          mismatches.push(`15-row: ${fifteenRowRequired} needed, ${fifteenRowAssigned} assigned`);

        if (mismatches.length > 0) {
          message = `Bleacher mismatch — ${mismatches.join(", ")}.`;
        }
      }
    }

    if (!message) return null;
    return { message, entityDescription };
  },

  evaluateInMemory({ event, allBleachers }: InMemoryAlertContext): AlertPayload[] {
    const alerts: AlertPayload[] = [];
    const assignedBleachers = allBleachers.filter((b) => event.bleacherUuids.includes(b.id));
    const entityDescription = eventEntityDescription(event);

    const makeAlert = (message: string): AlertPayload => ({
      entity_uuid: event.eventUuid,
      entity_type: "event",
      title: TITLE,
      message,
      entity_description: entityDescription,
    });

    if (event.lenient) {
      if (!event.seats) return alerts;
      const totalAssignedSeats = assignedBleachers.reduce(
        (sum, b) => sum + (b.bleacher_seats ?? 0),
        0,
      );
      if (totalAssignedSeats !== event.seats) {
        alerts.push(
          makeAlert(`Seat mismatch: ${event.seats} required, ${totalAssignedSeats} assigned.`),
        );
      }
    } else {
      if (event.bleacherRequirements && event.bleacherRequirements.length > 0) {
        const mismatches: string[] = [];
        for (const req of event.bleacherRequirements) {
          const assigned = assignedBleachers.filter(
            (b) => b.bleacher_type_uuid === req.bleacherTypeUuid,
          ).length;
          if (assigned !== req.quantity) {
            mismatches.push(`Type: ${req.quantity} needed, ${assigned} assigned`);
          }
        }
        if (mismatches.length > 0) {
          alerts.push(makeAlert(`Bleacher mismatch — ${mismatches.join(", ")}.`));
        }
      } else {
        const sevenRowRequired = event.sevenRow ?? 0;
        const tenRowRequired = event.tenRow ?? 0;
        const fifteenRowRequired = event.fifteenRow ?? 0;

        const sevenRowAssigned = assignedBleachers.filter((b) => b.bleacher_rows === 7).length;
        const tenRowAssigned = assignedBleachers.filter((b) => b.bleacher_rows === 10).length;
        const fifteenRowAssigned = assignedBleachers.filter((b) => b.bleacher_rows === 15).length;

        const mismatches: string[] = [];
        if (sevenRowAssigned !== sevenRowRequired)
          mismatches.push(`7-row: ${sevenRowRequired} needed, ${sevenRowAssigned} assigned`);
        if (tenRowAssigned !== tenRowRequired)
          mismatches.push(`10-row: ${tenRowRequired} needed, ${tenRowAssigned} assigned`);
        if (fifteenRowAssigned !== fifteenRowRequired)
          mismatches.push(`15-row: ${fifteenRowRequired} needed, ${fifteenRowAssigned} assigned`);

        if (mismatches.length > 0) {
          alerts.push(makeAlert(`Bleacher mismatch — ${mismatches.join(", ")}.`));
        }
      }
    }

    return alerts;
  },

  async recipients(eventUuid, _supabase) {
    const rows = await typedGetAll(
      db
        .selectFrom("Events as e")
        .select(["e.created_by_user_uuid as created_by_user_uuid"])
        .where("e.id", "=", eventUuid)
        .where("e.deleted", "=", 0)
        .limit(1)
        .compile(),
      expect<{ created_by_user_uuid: string | null }>(),
    );
    const uuid = rows[0]?.created_by_user_uuid;
    return uuid ? [uuid] : [];
  },
};
