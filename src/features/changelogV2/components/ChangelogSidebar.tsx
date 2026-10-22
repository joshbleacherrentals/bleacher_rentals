import Link from "next/link";
import {
  BASE_PATH,
  MONTH_NAMES,
  allYears,
  monthHref,
  monthsOfYear,
  releaseHref,
  yearHref,
} from "../navigation";

const link = (active: boolean) =>
  `block rounded px-2 py-1 text-sm transition-colors ${
    active
      ? "bg-rm-accent-soft font-semibold text-rm-accent"
      : "text-rm-ink-muted hover:bg-rm-sunken hover:text-rm-ink"
  }`;

/** Year → month → release, as a tree. The branch you are on is open; the rest fold away. */
export function ChangelogSidebar({
  year,
  month,
  version,
}: {
  year?: number;
  month?: number;
  version?: string;
}) {
  return (
    <nav aria-label="Changelog" className="rounded-lg border border-rm-hairline bg-rm-surface p-3">
      <Link href={BASE_PATH} className={link(year === undefined)}>
        ★ Latest update
      </Link>

      <div className="mt-2 space-y-1">
        {allYears().map(({ year: y }) => (
          <details
            key={y}
            open={year === undefined ? y === allYears()[0].year : y === year}
            className="group"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between rounded px-2 py-1 text-sm font-bold text-rm-ink hover:bg-rm-sunken">
              <Link href={yearHref(y)} className="flex-1">
                {y}
              </Link>
              <span className="text-xs text-rm-ink-faint transition-transform group-open:rotate-90">
                ▸
              </span>
            </summary>

            <div className="ml-2 border-l border-rm-hairline pl-2">
              {monthsOfYear(y).map((m) => {
                const here = y === year && m.month === month;
                return (
                  <details
                    key={m.month}
                    open={here || (year === undefined && m === monthsOfYear(y)[0])}
                  >
                    <summary className="cursor-pointer list-none">
                      <Link
                        href={monthHref(y, m.month)}
                        className={link(here && version === undefined)}
                      >
                        {MONTH_NAMES[m.month - 1]}
                        <span className="ml-1 text-xs text-rm-ink-faint">
                          ({m.releases.length})
                        </span>
                      </Link>
                    </summary>
                    <ul className="ml-2 border-l border-rm-hairline pl-2">
                      {m.releases.map((r) => (
                        <li key={r.version}>
                          <Link
                            href={releaseHref(y, m.month, r.version)}
                            className={link(here && version === r.version)}
                          >
                            <span className="font-mono">v{r.version}</span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </details>
                );
              })}
            </div>
          </details>
        ))}
      </div>
    </nav>
  );
}
