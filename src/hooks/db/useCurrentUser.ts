"use client";
import { useUser } from "@clerk/nextjs";
import { useMemo } from "react";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

type CurrentUser = {
  id: string;
  created_at: string | null;
  avatar_image_url: string | null;
  changelog_last_read_at: string | null;
  inspection_queue_last_seen_at: string | null;
  clerk_user_id: string | null;
  email: string | null;
  expo_push_token: string | null;
  first_name: string | null;
  is_admin: number | null;
  is_viewer: number | null;
  last_name: string | null;
  phone: string | null;
  role: number | null;
  status_uuid: string | null;
};

export function useCurrentUser(): {
  data: CurrentUser[] | null;
  isLoading: boolean;
  error: Error | undefined;
} {
  const { user } = useUser();
  const clerkUserId = user?.id ?? null;

  // Build the SQL with Kysely (type-safe tables/columns)
  const clerkUserIdForQuery = clerkUserId ?? "__no_clerk_user__";

  const compiled = useMemo(() => {
    return db
      .selectFrom("Users")
      .selectAll()
      .where("clerk_user_id", "=", clerkUserIdForQuery)
      .limit(1)
      .compile();
  }, [clerkUserIdForQuery]);

  const { data, isLoading, error } = useTypedQuery(compiled, expect<CurrentUser>());

  return { data, isLoading, error };
}
