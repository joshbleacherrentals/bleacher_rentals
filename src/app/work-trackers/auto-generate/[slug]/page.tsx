import { PlanningPage } from "@/features/autoWorkTrackers/components/PlanningPage";

export default async function Page({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  return <PlanningPage areaKey="auto" slug={slug} />;
}
