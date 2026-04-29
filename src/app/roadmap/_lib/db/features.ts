import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";
import type { FeatureStatus } from "../types";

export type SaveFeatureInput = {
  featureId: string | null;
  quarterId: string;
  title: string;
  description: string | null;
  status: FeatureStatus;
  sprintIds: string[];
};

export async function saveFeature(input: SaveFeatureInput): Promise<string> {
  let featureId = input.featureId;

  if (featureId) {
    const compiled = db
      .updateTable("RoadmapFeatures")
      .set({
        title: input.title,
        description: input.description,
        status: input.status,
      })
      .where("id", "=", featureId)
      .compile();
    await typedExecute(compiled);
  } else {
    featureId = crypto.randomUUID();
    const compiled = db
      .insertInto("RoadmapFeatures")
      .values({
        id: featureId,
        created_at: new Date().toISOString(),
        quarter_id: input.quarterId,
        title: input.title,
        description: input.description,
        status: input.status,
        sort_order: 0,
      })
      .compile();
    await typedExecute(compiled);
  }

  await typedExecute(
    db
      .deleteFrom("RoadmapFeatureSprintLabels")
      .where("feature_id", "=", featureId)
      .compile()
  );

  for (const sprintId of input.sprintIds) {
    await typedExecute(
      db
        .insertInto("RoadmapFeatureSprintLabels")
        .values({
          id: crypto.randomUUID(),
          feature_id: featureId,
          sprint_id: sprintId,
          created_at: new Date().toISOString(),
        })
        .compile()
    );
  }

  return featureId;
}

export async function deleteFeature(featureId: string) {
  await typedExecute(
    db.deleteFrom("RoadmapFeatures").where("id", "=", featureId).compile()
  );
}

export async function setFeatureStatus(featureId: string, status: FeatureStatus) {
  await typedExecute(
    db
      .updateTable("RoadmapFeatures")
      .set({ status })
      .where("id", "=", featureId)
      .compile()
  );
}
