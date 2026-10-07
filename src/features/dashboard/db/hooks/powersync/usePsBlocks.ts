"use client";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";

export type PsBlockRow = {
  id: string;
  bleacher_uuid: string | null;
  text: string | null;
  date: string | null;
  created_by_user_uuid: string | null;
};

const compiled = db
  .selectFrom("Blocks as bl")
  .select(["bl.id", "bl.bleacher_uuid", "bl.text", "bl.date", "bl.created_by_user_uuid"])
  .compile();

export function usePsBlocks() {
  const { data } = useTypedQuery(compiled, expect<PsBlockRow>());
  return data ?? [];
}
