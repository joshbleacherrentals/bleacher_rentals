"use client";

/**
 * A count in a pill — the sidebar's "N need attention" nag, and the same pill
 * reused next to a week or a driver in the work tracker lists.
 *
 * The tone carries the meaning: amber is a queue that wants working through,
 * red is work that was handed back and now has to be re-covered. Both live
 * here so the two never drift into three slightly different pills.
 */
export type CountBadgeTone = "amber" | "red";

const TONE_CLASSES: Record<CountBadgeTone, string> = {
  amber: "bg-amber-500",
  red: "bg-red-600",
};

export function CountBadge({
  count,
  label,
  tone = "amber",
  className = "",
  testId = "count-badge",
}: {
  count: number;
  /** Read out to screen readers in place of the bare number. */
  label: string;
  tone?: CountBadgeTone;
  className?: string;
  testId?: string;
}) {
  return (
    <span
      data-testid={testId}
      aria-label={label}
      className={`shrink-0 rounded-full px-1.5 text-xs font-semibold text-white ${TONE_CLASSES[tone]} ${className}`}
    >
      {count}
    </span>
  );
}
