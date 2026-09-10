"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { sql } from "@powersync/kysely-driver";
import { filterBySearch } from "../util/filterBySearch";
import { useSearchQueryStore } from "../state/useSearchQueryStore";

export type Maintainer = {
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  clerkUserId: string | null;
  createdAt: string | null;
  statusUuid: string | null;
  isAdmin: number;
  isActive: number | null;
};

export function useMaintainers(): Maintainer[] {
  const compiled = db
    .selectFrom("Maintainers as maint")
    .innerJoin("Users as u", "u.id", "maint.user_uuid")
    .select([
      "u.id as userUuid",
      "u.first_name as firstName",
      "u.last_name as lastName",
      "u.email as email",
      "u.clerk_user_id as clerkUserId",
      "u.created_at as createdAt",
      "u.status_uuid as statusUuid",
      sql<number>`case when u.is_admin = 1 then 1 else 0 end`.as("isAdmin"),
      "maint.is_active as isActive",
    ])
    .orderBy("u.first_name", "asc")
    .orderBy("u.last_name", "asc")
    .compile();

  const { data } = useTypedQuery(compiled, expect<Maintainer>());

  const searchQuery = useSearchQueryStore((s) => s.searchQuery);

  return filterBySearch(data ?? [], searchQuery);
}
