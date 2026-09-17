export type SprintDates = {
  id: string;
  quarter_id: string | null;
  start_date: string | null;
  end_date: string | null;
};

/**
 * The sprint that is running on `today` (YYYY-MM-DD): the latest one that has
 * already started. A finished sprint stays current through the gap until the next
 * one starts, so there is always somewhere to land once the first sprint began.
 */
export function pickCurrentSprint<T extends SprintDates>(sprints: T[], today: string): T | null {
  let current: T | null = null;
  for (const s of sprints) {
    if (!s.start_date || s.start_date > today) continue;
    if (!current || s.start_date > current.start_date!) current = s;
  }
  return current;
}
