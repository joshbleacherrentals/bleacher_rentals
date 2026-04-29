"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { Sprint, SprintWithCounts } from "../types";

type SprintRow = {
  id: string;
  created_at: string | null;
  quarter_id: string | null;
  sprint_number: number | null;
  start_date: string | null;
  end_date: string | null;
};

function toSprint(r: SprintRow): Sprint {
  return {
    id: r.id,
    created_at: r.created_at ?? "",
    quarter_id: r.quarter_id ?? "",
    sprint_number: r.sprint_number ?? 0,
    start_date: r.start_date ?? "",
    end_date: r.end_date ?? "",
  };
}

export function useSprintsForQuarter(quarterId: string | null) {
  const safeId = quarterId ?? "__none__";

  const sprintsCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapSprints")
        .select(["id", "created_at", "quarter_id", "sprint_number", "start_date", "end_date"])
        .where("quarter_id", "=", safeId)
        .orderBy("sprint_number", "asc")
        .compile(),
    [safeId],
  );

  const totalCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTasks as t")
        .innerJoin("RoadmapSprints as s", "s.id", "t.sprint_id")
        .select(({ fn }) => ["t.sprint_id as sprint_id", fn.count<number>("t.id").as("task_count")])
        .where("s.quarter_id", "=", safeId)
        .groupBy("t.sprint_id")
        .compile(),
    [safeId],
  );

  const doneCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapTasks as t")
        .innerJoin("RoadmapSprints as s", "s.id", "t.sprint_id")
        .select(({ fn }) => [
          "t.sprint_id as sprint_id",
          fn.count<number>("t.id").as("task_done_count"),
        ])
        .where("s.quarter_id", "=", safeId)
        .where("t.status", "=", "completed")
        .groupBy("t.sprint_id")
        .compile(),
    [safeId],
  );

  const {
    data: sprintRows,
    isLoading,
    error,
  } = useTypedQuery(sprintsCompiled, expect<SprintRow>());
  const { data: totalRows } = useTypedQuery(
    totalCompiled,
    expect<{ sprint_id: string | null; task_count: number }>(),
  );
  const { data: doneRows } = useTypedQuery(
    doneCompiled,
    expect<{ sprint_id: string | null; task_done_count: number }>(),
  );

  const sprints = useMemo<SprintWithCounts[]>(() => {
    const totalMap = new Map<string, number>();
    (totalRows ?? []).forEach((r) => {
      if (r.sprint_id) totalMap.set(r.sprint_id, Number(r.task_count ?? 0));
    });
    const doneMap = new Map<string, number>();
    (doneRows ?? []).forEach((r) => {
      if (r.sprint_id) doneMap.set(r.sprint_id, Number(r.task_done_count ?? 0));
    });

    return (sprintRows ?? []).map((r) => {
      const sprint = toSprint(r);
      return {
        ...sprint,
        task_count: totalMap.get(sprint.id) ?? 0,
        task_done_count: doneMap.get(sprint.id) ?? 0,
      };
    });
  }, [sprintRows, totalRows, doneRows]);

  return { sprints, isLoading, error };
}

export function useSprint(sprintId: string | null) {
  const safeId = sprintId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapSprints")
        .select(["id", "created_at", "quarter_id", "sprint_number", "start_date", "end_date"])
        .where("id", "=", safeId)
        .limit(1)
        .compile(),
    [safeId],
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<SprintRow>());

  const sprint = useMemo<Sprint | null>(() => {
    if (!sprintId) return null;
    const r = data?.[0];
    return r ? toSprint(r) : null;
  }, [data, sprintId]);

  return { sprint, isLoading, error };
}

type SprintWithQuarterRow = {
  id: string;
  sprint_number: number | null;
  quarter_year: number | null;
  quarter_quarter: number | null;
};

export function useAllSprintsMap(): Map<string, string> {
  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapSprints as s")
        .innerJoin("RoadmapQuarters as q", "q.id", "s.quarter_id")
        .select([
          "s.id as id",
          "s.sprint_number as sprint_number",
          "q.year as quarter_year",
          "q.quarter as quarter_quarter",
        ])
        .compile(),
    [],
  );

  const { data } = useTypedQuery(compiled, expect<SprintWithQuarterRow>());

  return useMemo(() => {
    const map = new Map<string, string>();
    for (const r of data ?? []) {
      if (r.id) {
        map.set(
          r.id,
          `Q${r.quarter_quarter ?? ""} ${r.quarter_year ?? ""} Sprint ${r.sprint_number ?? ""}`,
        );
      }
    }
    return map;
  }, [data]);
}
