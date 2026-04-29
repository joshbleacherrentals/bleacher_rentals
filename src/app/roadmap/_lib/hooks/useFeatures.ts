"use client";

import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import { useMemo } from "react";
import type { Feature, FeatureStatus } from "../types";

type FeatureRow = {
  id: string;
  created_at: string | null;
  completed_at: string | null;
  quarter_id: string | null;
  title: string | null;
  description: string | null;
  status: string | null;
  sort_order: number | null;
};

type LabelRow = {
  feature_id: string | null;
  sprint_id: string | null;
};

export function useFeaturesForQuarter(quarterId: string | null) {
  const safeId = quarterId ?? "__none__";

  const featuresCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapFeatures")
        .select([
          "id",
          "created_at",
          "completed_at",
          "quarter_id",
          "title",
          "description",
          "status",
          "sort_order",
        ])
        .where("quarter_id", "=", safeId)
        .orderBy("sort_order", "asc")
        .orderBy("created_at", "asc")
        .compile(),
    [safeId]
  );

  const labelsCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapFeatureSprintLabels as l")
        .innerJoin("RoadmapFeatures as f", "f.id", "l.feature_id")
        .select(["l.feature_id as feature_id", "l.sprint_id as sprint_id"])
        .where("f.quarter_id", "=", safeId)
        .compile(),
    [safeId]
  );

  const { data: featureRows, isLoading, error } = useTypedQuery(
    featuresCompiled,
    expect<FeatureRow>()
  );
  const { data: labelRows } = useTypedQuery(labelsCompiled, expect<LabelRow>());

  const features = useMemo<Feature[]>(() => {
    const labelsByFeature = new Map<string, string[]>();
    (labelRows ?? []).forEach((r) => {
      if (!r.feature_id || !r.sprint_id) return;
      const list = labelsByFeature.get(r.feature_id) ?? [];
      list.push(r.sprint_id);
      labelsByFeature.set(r.feature_id, list);
    });

    return (featureRows ?? []).map((r) => ({
      id: r.id,
      created_at: r.created_at ?? "",
      completed_at: r.completed_at,
      quarter_id: r.quarter_id ?? "",
      title: r.title ?? "",
      description: r.description,
      status: (r.status as FeatureStatus) ?? "draft",
      sort_order: r.sort_order ?? 0,
      sprint_ids: labelsByFeature.get(r.id) ?? [],
    }));
  }, [featureRows, labelRows]);

  return { features, isLoading, error };
}

export function useFeature(featureId: string | null) {
  const safeId = featureId ?? "__none__";

  const compiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapFeatures")
        .select([
          "id",
          "created_at",
          "completed_at",
          "quarter_id",
          "title",
          "description",
          "status",
          "sort_order",
        ])
        .where("id", "=", safeId)
        .limit(1)
        .compile(),
    [safeId]
  );

  const labelsCompiled = useMemo(
    () =>
      db
        .selectFrom("RoadmapFeatureSprintLabels")
        .select(["feature_id", "sprint_id"])
        .where("feature_id", "=", safeId)
        .compile(),
    [safeId]
  );

  const { data, isLoading, error } = useTypedQuery(compiled, expect<FeatureRow>());
  const { data: labelRows } = useTypedQuery(labelsCompiled, expect<LabelRow>());

  const feature = useMemo<Feature | null>(() => {
    if (!featureId) return null;
    const r = data?.[0];
    if (!r) return null;
    return {
      id: r.id,
      created_at: r.created_at ?? "",
      completed_at: r.completed_at,
      quarter_id: r.quarter_id ?? "",
      title: r.title ?? "",
      description: r.description,
      status: (r.status as FeatureStatus) ?? "draft",
      sort_order: r.sort_order ?? 0,
      sprint_ids: (labelRows ?? [])
        .map((l) => l.sprint_id)
        .filter((s): s is string => s !== null),
    };
  }, [data, labelRows, featureId]);

  return { feature, isLoading, error };
}
