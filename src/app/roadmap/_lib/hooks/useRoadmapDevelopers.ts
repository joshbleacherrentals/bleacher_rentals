"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";

type Row = {
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
};

export type DeveloperOption = {
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
  label: string;
};

/**
 * Returns all active developers (for assignment dropdowns in the roadmap).
 */
export function useRoadmapDevelopers(): DeveloperOption[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Developers as d")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .select(["u.id as userUuid", "u.first_name as firstName", "u.last_name as lastName"])
        .where("d.is_active", "=", 1)
        .orderBy("u.first_name", "asc")
        .orderBy("u.last_name", "asc")
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  return useMemo(
    () =>
      (data ?? []).map((r) => ({
        userUuid: r.userUuid,
        firstName: r.firstName,
        lastName: r.lastName,
        label: [r.firstName, r.lastName].filter(Boolean).join(" ") || "Unknown",
      })),
    [data],
  );
}
