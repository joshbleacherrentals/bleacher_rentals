"use client";

import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type BleacherOption = { uuid: string; bleacherNumber: number | null };
export type DriverOption = {
  uuid: string;
  firstName: string | null;
  lastName: string | null;
};

/** Reactive list of all bleachers (number ascending) for filter dropdowns. */
export function useBleacherOptions(): BleacherOption[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Bleachers")
        .select(["id as uuid", "bleacher_number as bleacherNumber"])
        .orderBy("bleacher_number", "asc")
        .compile(),
    [],
  );
  const { data = [] } = useTypedQuery(compiled, expect<BleacherOption>());
  return data;
}

/** Reactive list of all drivers joined to Users for names. */
export function useDriverOptions(): DriverOption[] {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Drivers as d")
        .innerJoin("Users as u", "u.id", "d.user_uuid")
        .select(["d.id as uuid", "u.first_name as firstName", "u.last_name as lastName"])
        .orderBy("u.first_name", "asc")
        .compile(),
    [],
  );
  const { data = [] } = useTypedQuery(compiled, expect<DriverOption>());
  return data;
}
