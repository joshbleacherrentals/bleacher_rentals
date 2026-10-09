"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

/**
 * The name of one event type, by id.
 *
 * Unlike `useEventTypes` — which feeds the quote form's dropdown and so leaves out deleted types —
 * this does not filter on `deleted`. A quote keeps pointing at the type it was saved with, and a
 * read-only display should say what that was, not go blank because the type was retired since.
 */
export function useEventTypeName(eventTypeUuid: string | null): {
  name: string | null;
  isLoading: boolean;
} {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("EventTypes")
        .select(["name"])
        .where("id", "=", eventTypeUuid ?? "")
        .limit(1)
        .compile(),
    [eventTypeUuid],
  );

  const { data, isLoading } = useTypedQuery(compiled, expect<{ name: string | null }>());
  return { name: data?.[0]?.name ?? null, isLoading };
}
