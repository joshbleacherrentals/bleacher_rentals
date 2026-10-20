import { describe, expect, it } from "vitest";
import { formatWait } from "./formatWait";

const s = 1000;
const m = 60 * s;
const h = 60 * m;
const d = 24 * h;

describe("formatWait", () => {
  it("writes seconds alone under a minute", () => {
    expect(formatWait(0)).toBe("0s");
    expect(formatWait(32 * s)).toBe("32s");
    expect(formatWait(59 * s + 999)).toBe("59s");
  });

  it("writes minutes and two-digit seconds under an hour", () => {
    expect(formatWait(3 * m + 32 * s)).toBe("3m 32s");
    expect(formatWait(m)).toBe("1m 00s");
    expect(formatWait(59 * m + 59 * s)).toBe("59m 59s");
  });

  it("writes hours, then two-digit minutes and seconds, under a day", () => {
    expect(formatWait(3 * h + 5 * m + 12 * s)).toBe("3h 05m 12s");
    expect(formatWait(h)).toBe("1h 00m 00s");
  });

  it("writes days with two-digit hours, minutes and seconds", () => {
    expect(formatWait(2 * d + 8 * h + 24 * m + 32 * s)).toBe("2d 08h 24m 32s");
    expect(formatWait(d)).toBe("1d 00h 00m 00s");
    expect(formatWait(30 * d)).toBe("30d 00h 00m 00s");
  });

  it("treats a negative wait (a clock behind the server's) as 0", () => {
    expect(formatWait(-5 * s)).toBe("0s");
  });
});
