import { db } from "@/components/providers/SystemProvider";
import { expect, typedExecute, typedGetAll } from "@/lib/powersync/typedQuery";

/**
 * The two things the dashboard's event panel may still write, each at the moment the user does it
 * (docs/specs/dashboard-events-read-only.md, D1). Both go through PowerSync, so they work offline.
 */

/**
 * Writes for one event run one after another, in the order they were asked for. A quick +/– on the
 * same bleacher would otherwise let the delete overtake the insert, and the bleacher would stay
 * linked while the grid shows it unlinked.
 */
const tails = new Map<string, Promise<unknown>>();

function inOrder<T>(eventUuid: string, write: () => Promise<T>): Promise<T> {
  const previous = tails.get(eventUuid) ?? Promise.resolve();
  // A failed write must not stop the ones queued behind it.
  const run = previous.catch(() => undefined).then(write);
  tails.set(eventUuid, run);
  const clear = () => {
    if (tails.get(eventUuid) === run) tails.delete(eventUuid);
  };
  run.then(clear, clear);
  return run;
}

/**
 * Puts the event on a bleacher, or takes it off.
 *
 * `linked: true` inserts the `BleacherEvents` row only if it is absent (the check reads the
 * database, not the panel's copy, so a stale panel cannot make a second row). The default columns
 * are the ones `updateEvent` used. `linked: false` deletes the row of this pair.
 */
export function setEventBleacherLinked(input: {
  eventUuid: string;
  bleacherUuid: string;
  linked: boolean;
}): Promise<void> {
  const { eventUuid, bleacherUuid, linked } = input;

  return inOrder(eventUuid, async () => {
    if (!linked) {
      await typedExecute(
        db
          .deleteFrom("BleacherEvents")
          .where("event_uuid", "=", eventUuid)
          .where("bleacher_uuid", "=", bleacherUuid)
          .compile(),
      );
      return;
    }

    const existing = await typedGetAll(
      db
        .selectFrom("BleacherEvents")
        .select("id")
        .where("event_uuid", "=", eventUuid)
        .where("bleacher_uuid", "=", bleacherUuid)
        .limit(1)
        .compile(),
      expect<{ id: string }>(),
    );
    if (existing.length > 0) return;

    await typedExecute(
      db
        .insertInto("BleacherEvents")
        .values({
          id: crypto.randomUUID(),
          bleacher_uuid: bleacherUuid,
          event_uuid: eventUuid,
          setup_text: "",
          setup_confirmed: 0,
          teardown_text: "",
          teardown_confirmed: 0,
        })
        .compile(),
    );
  });
}

/** Writes `Events.hsl_hue`. */
export function setEventHue(input: { eventUuid: string; hslHue: number }): Promise<void> {
  return inOrder(input.eventUuid, async () => {
    await typedExecute(
      db
        .updateTable("Events")
        .set({ hsl_hue: input.hslHue })
        .where("id", "=", input.eventUuid)
        .compile(),
    );
  });
}

/**
 * What happens when the user lets go of the colour slider: the colour is written only if it is not
 * where the gesture began, so a click on the thumb that moves nothing saves nothing. A failure is
 * thrown to the caller, which puts the slider back to `startHue` and shows the error.
 */
export async function commitEventHue(input: {
  eventUuid: string;
  /** The colour when the gesture began (null: the event had none). */
  startHue: number | null;
  /** The colour at release. */
  endHue: number;
}): Promise<"saved" | "unchanged"> {
  if (input.startHue === input.endHue) return "unchanged";
  await setEventHue({ eventUuid: input.eventUuid, hslHue: input.endHue });
  return "saved";
}
