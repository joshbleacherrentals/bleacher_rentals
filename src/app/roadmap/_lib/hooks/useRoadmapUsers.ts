"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { SimpleUser } from "../types";

type Row = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  email: string | null;
  status_uuid: string | null;
};

export function useRoadmapUsers() {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Users")
        .select(["id", "first_name", "last_name", "email", "status_uuid"])
        .compile(),
    []
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  const userMap = useMemo(() => {
    const map = new Map<string, SimpleUser>();
    for (const r of data ?? []) {
      map.set(r.id, {
        id: r.id,
        first_name: r.first_name,
        last_name: r.last_name,
        email: r.email ?? "",
        status_uuid: r.status_uuid,
      });
    }
    return map;
  }, [data]);

  return { userMap };
}

export function displayName(user: SimpleUser | undefined): string {
  if (!user) return "Unknown";
  const name = `${user.first_name ?? ""} ${user.last_name ?? ""}`.trim();
  return name || user.email;
}

export function initials(user: SimpleUser | undefined): string {
  if (!user) return "?";
  const f = user.first_name?.[0] ?? "";
  const l = user.last_name?.[0] ?? "";
  return (f + l).toUpperCase() || (user.email[0]?.toUpperCase() ?? "?");
}
