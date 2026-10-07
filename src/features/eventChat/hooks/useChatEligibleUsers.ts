"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import { STATUSES } from "@/features/manageTeam/constants";

export type ChatEligibleUser = {
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isAdmin: boolean;
};

type Row = {
  userUuid: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  isAdmin: number | null;
};

/**
 * All active admins, account managers and accountants who can appear in the members modal and the
 * mention picker. Admins (is_admin), AMs (AccountManagers row) and accountants (Accountants row) are
 * deduped by user id. (docs/specs/accountant-quotes-11-accountant-internal-chat.md §4)
 */
export function useChatEligibleUsers() {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("Users as u")
        .leftJoin("AccountManagers as am", (join) =>
          join.onRef("am.user_uuid", "=", "u.id").on("am.is_active", "=", 1),
        )
        .leftJoin("Accountants as acct", (join) =>
          join.onRef("acct.user_uuid", "=", "u.id").on("acct.is_active", "=", 1),
        )
        .select([
          "u.id as userUuid",
          "u.first_name as firstName",
          "u.last_name as lastName",
          "u.email as email",
          "u.is_admin as isAdmin",
        ])
        .where("u.status_uuid", "=", STATUSES.active)
        .where((eb) =>
          eb.or([
            eb("u.is_admin", "=", 1),
            eb("am.id", "is not", null),
            eb("acct.id", "is not", null),
          ]),
        )
        .orderBy("u.first_name", "asc")
        .orderBy("u.last_name", "asc")
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<Row>());

  const users = useMemo<ChatEligibleUser[]>(
    () =>
      (data ?? []).map((r) => ({
        userUuid: r.userUuid,
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        isAdmin: r.isAdmin === 1,
      })),
    [data],
  );

  return { users };
}

export function chatUserDisplayName(user: ChatEligibleUser): string {
  const name = `${user.firstName ?? ""} ${user.lastName ?? ""}`.trim();
  return name || user.email || "Unknown";
}

export function chatUserInitials(user: ChatEligibleUser): string {
  const f = user.firstName?.[0] ?? "";
  const l = user.lastName?.[0] ?? "";
  return (f + l).toUpperCase() || (user.email?.[0]?.toUpperCase() ?? "?");
}
