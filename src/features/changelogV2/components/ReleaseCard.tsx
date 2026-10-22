import Link from "next/link";
import type { MonthEntry, Release } from "../types";
import { releaseHref } from "../navigation";

export const formatDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-CA", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });

/** One release, in full. `linked` makes the heading a link, for pages that stack several. */
export function ReleaseCard({
  release,
  month,
  linked = false,
  isLatest = false,
}: {
  release: Release;
  month: MonthEntry;
  linked?: boolean;
  isLatest?: boolean;
}) {
  const title = (
    <>
      <span className="font-mono text-sm font-semibold text-rm-accent">v{release.version}</span>
      <span className="text-rm-ink-muted text-sm">{formatDate(release.date)}</span>
      {isLatest && (
        <span className="rounded-full bg-rm-danger px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide text-white">
          Latest
        </span>
      )}
    </>
  );

  return (
    <article
      id={`v${release.version}`}
      className="scroll-mt-6 rounded-lg border border-rm-hairline bg-rm-surface p-6"
    >
      <header className="mb-5">
        {linked ? (
          <Link
            href={releaseHref(month.year, month.month, release.version)}
            className="flex flex-wrap items-center gap-3 hover:underline"
          >
            {title}
          </Link>
        ) : (
          <div className="flex flex-wrap items-center gap-3">{title}</div>
        )}
        <h2 className="mt-1 text-xl font-bold text-rm-ink">{release.headline}</h2>
        {release.video && (
          <a
            href={release.video}
            target="_blank"
            rel="noreferrer"
            className="mt-1 inline-block text-sm text-rm-accent hover:underline"
          >
            ▶ Watch the walkthrough
          </a>
        )}
      </header>

      <div className="space-y-6">
        {release.sections.map((s) => (
          <section key={s.title}>
            <h3 className="text-base font-semibold text-rm-ink">
              <span className="mr-2">{s.icon}</span>
              {s.title}
            </h3>
            {s.where && (
              <p className="mt-0.5 text-xs font-semibold uppercase tracking-wide text-rm-ink-faint">
                {s.where}
              </p>
            )}
            <p className="mt-2 text-sm leading-relaxed text-rm-ink">{s.body}</p>
            {s.bullets && (
              <ul className="mt-2 list-disc space-y-1 pl-5 text-sm text-rm-ink">
                {s.bullets.map((b) => (
                  <li key={b}>{b}</li>
                ))}
              </ul>
            )}
            {s.warning && (
              <p className="mt-3 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                ⚠️ {s.warning}
              </p>
            )}
          </section>
        ))}
      </div>
    </article>
  );
}
