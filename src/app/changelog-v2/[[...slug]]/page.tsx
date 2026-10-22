import { notFound } from "next/navigation";
import { ChangelogSidebar } from "@/features/changelogV2/components/ChangelogSidebar";
import { ChangelogView } from "@/features/changelogV2/components/ChangelogViews";
import { resolve } from "@/features/changelogV2/navigation";

/**
 * Design sample for a page-based changelog (no markdown). Server-rendered, so every year, month and
 * release has its own shareable URL:
 *   /changelog-v2                         the newest release
 *   /changelog-v2/2026                    the year: summary + its months
 *   /changelog-v2/2026/10                 the month: summary + every release, scrolling
 *   /changelog-v2/2026/10/1.20.0          one release, with older / newer arrows
 */
export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug = [] } = await params;
  const view = resolve(slug);
  if (!view) notFound();

  const selected =
    view.kind === "release"
      ? {
          year: view.current.month.year,
          month: view.current.month.month,
          version: view.current.release.version,
        }
      : view.kind === "month"
        ? { year: view.month.year, month: view.month.month }
        : { year: view.year.year };

  return (
    <div className="min-h-full bg-rm-sunken">
      <main className="mx-auto grid max-w-6xl gap-6 p-6 lg:grid-cols-[240px_1fr]">
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <h1 className="mb-3 text-lg font-bold text-rm-ink">What’s new</h1>
          <ChangelogSidebar {...selected} />
        </aside>
        <ChangelogView view={view} />
      </main>
    </div>
  );
}
