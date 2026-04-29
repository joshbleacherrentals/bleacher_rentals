import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

export type SaveQuarterInput = {
  quarterId: string | null;
  year: number;
  quarter: number;
};

export async function saveQuarter(input: SaveQuarterInput): Promise<string> {
  if (input.quarterId) {
    const compiled = db
      .updateTable("RoadmapQuarters")
      .set({
        year: input.year,
        quarter: input.quarter,
      })
      .where("id", "=", input.quarterId)
      .compile();
    await typedExecute(compiled);
    return input.quarterId;
  }

  const id = crypto.randomUUID();
  const compiled = db
    .insertInto("RoadmapQuarters")
    .values({
      id,
      created_at: new Date().toISOString(),
      year: input.year,
      quarter: input.quarter,
    })
    .compile();
  await typedExecute(compiled);
  return id;
}

export async function deleteQuarter(quarterId: string) {
  const compiled = db.deleteFrom("RoadmapQuarters").where("id", "=", quarterId).compile();
  await typedExecute(compiled);
}
