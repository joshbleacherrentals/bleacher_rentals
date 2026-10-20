const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

const pad = (n: number) => String(n).padStart(2, "0");

/**
 * How long something has waited, from the largest unit that is not zero down to seconds:
 * "32s", "3m 32s", "3h 05m 12s", "2d 08h 24m 32s". The first unit is written plainly and the rest
 * to two digits, so the figure does not jump in width as the seconds tick. A negative duration (a
 * clock that is a little behind the server's) is 0.
 */
export function formatWait(ms: number): string {
  const total = Math.max(0, Math.floor(ms / SECOND)) * SECOND;
  const days = Math.floor(total / DAY);
  const hours = Math.floor((total % DAY) / HOUR);
  const minutes = Math.floor((total % HOUR) / MINUTE);
  const seconds = Math.floor((total % MINUTE) / SECOND);

  if (days > 0) return `${days}d ${pad(hours)}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (hours > 0) return `${hours}h ${pad(minutes)}m ${pad(seconds)}s`;
  if (minutes > 0) return `${minutes}m ${pad(seconds)}s`;
  return `${seconds}s`;
}
