import { db } from "@/components/providers/SystemProvider";
import { typedExecute } from "@/lib/powersync/typedQuery";

export type SaveSprintInput = {
  sprintId: string | null;
  quarterId: string;
  sprintNumber: number;
  startDate: string;
  endDate: string;
};

export async function saveSprint(input: SaveSprintInput): Promise<string> {
  if (input.sprintId) {
    const compiled = db
      .updateTable("RoadmapSprints")
      .set({
        quarter_id: input.quarterId,
        sprint_number: input.sprintNumber,
        start_date: input.startDate,
        end_date: input.endDate,
      })
      .where("id", "=", input.sprintId)
      .compile();
    await typedExecute(compiled);
    return input.sprintId;
  }

  const id = crypto.randomUUID();
  const compiled = db
    .insertInto("RoadmapSprints")
    .values({
      id,
      created_at: new Date().toISOString(),
      quarter_id: input.quarterId,
      sprint_number: input.sprintNumber,
      start_date: input.startDate,
      end_date: input.endDate,
    })
    .compile();
  await typedExecute(compiled);
  return id;
}

export async function deleteSprint(sprintId: string) {
  const compiled = db.deleteFrom("RoadmapSprints").where("id", "=", sprintId).compile();
  await typedExecute(compiled);
}
