import { redirect } from "next/navigation";
import { legacyAutoWorkTrackersHref } from "@/features/autoWorkTrackers/utils/pages";

/**
 * Auto Work Trackers moved into Work Trackers (Verify, Auto Generate). Old links
 * and bookmarks land on the same page there, keeping the zone and week.
 */
export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ slug?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { slug } = await params;
  const query = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    if (typeof v === "string") query.set(k, v);
  redirect(legacyAutoWorkTrackersHref(slug?.[0], query.toString()));
}
