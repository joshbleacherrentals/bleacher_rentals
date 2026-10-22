import type { MonthEntry, YearEntry } from "../types";
import { november2025 } from "./2025/11";
import { december2025 } from "./2025/12";
import { october2026 } from "./2026/10";
import { september2026 } from "./2026/09";

/**
 * Everything the changelog shows, written as plain TypeScript. `/changelog` adds a release to its
 * month file (creating the month file, and the year entry, when a new month starts) and nothing else.
 */
export const YEARS: YearEntry[] = [
  {
    year: 2025,
    summary:
      "Sample: the year the basics came together: work trackers, the leaderboard and a calendar the drivers could actually read.",
  },
  {
    year: 2026,
    summary:
      "The year quotes moved fully into the app: website requests arrive as quotes, finance got its own role and tools, and the quote page became the place where a deal is worked from first message to signature.",
  },
];

export const MONTHS: MonthEntry[] = [october2026, september2026, december2025, november2025];
