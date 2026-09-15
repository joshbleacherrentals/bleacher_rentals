import type { PocDirection, PocResolution } from "./resolvePocContact";

export type PocValue = {
  contactUuid: string | null;
  pocText: string | null;
};

export type PocPopulateOutcome =
  | { kind: "apply"; value: PocValue }
  | { kind: "error"; messages: string[] };

/**
 * Turn a resolver result into what the button should do.
 *
 * The `unlinked` branch is the reason this is not a plain null check: the driver's mobile app
 * dials the POC through the `Contacts` record, so copying a bare name forward would hand over a
 * number-less contact. Refusing with the name in the message tells the user exactly which
 * neighbour to fix.
 */
export function describePocPopulateResult(
  resolution: PocResolution,
  direction: PocDirection,
): PocPopulateOutcome {
  const neighbour = direction === "past" ? "previous event" : "next event";

  if (!resolution) {
    return { kind: "error", messages: [`No contact found on the ${neighbour}.`] };
  }

  if (resolution.kind === "unlinked") {
    return {
      kind: "error",
      messages: [
        `Cannot populate from the ${neighbour}.`,
        `Its POC ("${resolution.displayName}") is free text with no contact record. Create a contact for it first.`,
      ],
    };
  }

  return {
    kind: "apply",
    value: { contactUuid: resolution.contactUuid, pocText: resolution.displayName },
  };
}
