"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type PsUserRow = {
  id: string;
  first_name: string | null;
  last_name: string | null;
  clerk_user_id: string | null;
  email: string | null;
  /** 0/1 in the local DB. `filterOwnerOptions` accepts either. */
  is_admin: number | null;
  /** Required: the owner dropdown filters inactive users on this column. */
  status_uuid: string | null;
};

const compiled = db
  .selectFrom("Users as u")
  .select([
    "u.id",
    "u.first_name",
    "u.last_name",
    "u.clerk_user_id",
    "u.email",
    "u.is_admin",
    "u.status_uuid",
  ])
  .compile();

export function usePsUsers() {
  const { data } = useTypedQuery(compiled, expect<PsUserRow>());
  return data ?? [];
}
