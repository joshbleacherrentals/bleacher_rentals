import Link from "next/link";
import { MONTH_NAMES, monthHref, releaseHref, yearHref, type View } from "../navigation";
import { ReleaseCard, formatDate } from "./ReleaseCard";

const crumb = "text-rm-accent hover:underline";

function Summary({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-rm-hairline bg-rm-accent-soft/40 p-5">
      <p className="text-xs font-bold uppercase tracking-wide text-rm-ink-faint">In short</p>
      <p className="mt-1 text-sm leading-relaxed text-rm-ink">{children}</p>
    </div>
  );
}

export function ChangelogView({ view }: { view: View }) {
  if (view.kind === "release") {
    const { current, newer, older, isLatest } = view;
    const { month, release } = current;
    return (
      <div className="space-y-4">
        <p className="text-sm text-rm-ink-muted">
          <Link href={yearHref(month.year)} className={crumb}>
            {month.year}
          </Link>{" "}
          /{" "}
          <Link href={monthHref(month.year, month.month)} className={crumb}>
            {MONTH_NAMES[month.month - 1]}
          </Link>{" "}
          / v{release.version}
        </p>
        <ReleaseCard release={release} month={month} isLatest={isLatest} />
        <div className="flex justify-between gap-3 text-sm">
          {older ? (
            <Link
              href={releaseHref(older.month.year, older.month.month, older.release.version)}
              className="rounded-lg border border-rm-hairline bg-rm-surface px-4 py-2 hover:border-rm-accent"
            >
              ← Older <span className="font-mono">v{older.release.version}</span>
            </Link>
          ) : (
            <span />
          )}
          {newer && (
            <Link
              href={releaseHref(newer.month.year, newer.month.month, newer.release.version)}
              className="rounded-lg border border-rm-hairline bg-rm-surface px-4 py-2 hover:border-rm-accent"
            >
              Newer <span className="font-mono">v{newer.release.version}</span> →
            </Link>
          )}
        </div>
      </div>
    );
  }

  if (view.kind === "month") {
    const { month } = view;
    return (
      <div className="space-y-4">
        <p className="text-sm text-rm-ink-muted">
          <Link href={yearHref(month.year)} className={crumb}>
            {month.year}
          </Link>{" "}
          / {MONTH_NAMES[month.month - 1]}
        </p>
        <h1 className="text-2xl font-bold text-rm-ink">
          {MONTH_NAMES[month.month - 1]} {month.year}
        </h1>
        <Summary>{month.summary}</Summary>
        {month.releases.map((release) => (
          <ReleaseCard key={release.version} release={release} month={month} linked />
        ))}
      </div>
    );
  }

  const { year, months } = view;
  return (
    <div className="space-y-4">
      <h1 className="text-2xl font-bold text-rm-ink">{year.year}</h1>
      <Summary>{year.summary}</Summary>
      <div className="grid gap-3 sm:grid-cols-2">
        {months.map((m) => (
          <Link
            key={m.month}
            href={monthHref(m.year, m.month)}
            className="rounded-lg border border-rm-hairline bg-rm-surface p-5 transition-colors hover:border-rm-accent"
          >
            <p className="text-lg font-bold text-rm-ink">{MONTH_NAMES[m.month - 1]}</p>
            <p className="mt-1 line-clamp-3 text-sm text-rm-ink-muted">{m.summary}</p>
            <p className="mt-3 text-xs text-rm-ink-faint">
              {m.releases.length} {m.releases.length === 1 ? "update" : "updates"} · latest{" "}
              {formatDate(m.releases[0].date)}
            </p>
          </Link>
        ))}
      </div>
    </div>
  );
}
