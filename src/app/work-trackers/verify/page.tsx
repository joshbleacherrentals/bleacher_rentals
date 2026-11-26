import { redirect } from "next/navigation";

/** Verify opens on its Dashboard, keeping the zone and week. */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(await searchParams))
    if (typeof v === "string") params.set(k, v);
  const q = params.toString();
  redirect(`/work-trackers/verify/dashboard${q ? `?${q}` : ""}`);
}
