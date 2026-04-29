"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { useRoadmapCurrentUserUuid } from "./useRoadmapCurrentUserUuid";

type UserRow = { isAdmin: number | null };
type DeveloperRow = { id: string };

/**
 * Returns whether the current user has developer-level access to the roadmap.
 * Developers (active entry in Developers table) and admins (is_admin = 1) can
 * manage sprints/quarters/tasks and change statuses.
 * Non-developers can only submit backlog tickets.
 */
export function useRoadmapAccessLevel() {
  const { userUuid, isLoading: uuidLoading } = useRoadmapCurrentUserUuid();

  const uuidForQuery = userUuid ?? "__no_user__";

  const userCompiled = useMemo(
    () =>
      db
        .selectFrom("Users")
        .select(["is_admin as isAdmin"])
        .where("id", "=", uuidForQuery)
        .limit(1)
        .compile(),
    [uuidForQuery],
  );

  const devCompiled = useMemo(
    () =>
      db
        .selectFrom("Developers")
        .select(["id"])
        .where("user_uuid", "=", uuidForQuery)
        .where("is_active", "=", 1)
        .limit(1)
        .compile(),
    [uuidForQuery],
  );

  const { data: userData, isLoading: userLoading } = useTypedQuery(userCompiled, expect<UserRow>());
  const { data: devData, isLoading: devLoading } = useTypedQuery(
    devCompiled,
    expect<DeveloperRow>(),
  );

  const isLoading = uuidLoading || userLoading || devLoading;
  const isAdmin = (userData?.[0]?.isAdmin ?? 0) === 1;
  const isDeveloperRecord = (devData?.length ?? 0) > 0;
  const isDeveloper = isAdmin || isDeveloperRecord;

  return { isDeveloper, isAdmin, isLoading, userUuid };
}
