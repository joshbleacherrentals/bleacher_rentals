"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";

export type Row = {
  id: string;
  name: string | null;
  html_content: string | null;
  created_at: string | null;
  deleted: number | null;
  /** 0/1 locally — PowerSync stores booleans as integers. */
  is_default: number | null;
};

export type TermsAndConditionsItem = {
  id: string;
  name: string;
  htmlContent: string;
  createdAt: string;
  /** The template a new quote starts with. At most one is true — see the partial unique index. */
  isDefault: boolean;
};

export function toItem(r: Row): TermsAndConditionsItem {
  return {
    id: r.id,
    name: r.name ?? "",
    htmlContent: r.html_content ?? "",
    createdAt: r.created_at ?? "",
    isDefault: !!r.is_default,
  };
}

/** The default template's id, or null when none is marked. */
export function findDefaultId(items: TermsAndConditionsItem[]): string | null {
  return items.find((t) => t.isDefault)?.id ?? null;
}

export function useTermsAndConditions() {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("TermsAndConditions")
        .select(["id", "name", "html_content", "created_at", "deleted", "is_default"])
        .where("deleted", "=", 0)
        .orderBy("created_at", "desc")
        .compile(),
    [],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<Row>());

  const items = useMemo<TermsAndConditionsItem[]>(() => (data ?? []).map(toItem), [data]);
  const defaultId = useMemo(() => findDefaultId(items), [items]);

  return { items, defaultId, isLoading, error };
}
