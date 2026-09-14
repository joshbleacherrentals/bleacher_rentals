import { describe, it, expect } from "vitest";
import { parseQboApiResponseText } from "./parseQboApiResponse";

describe("parseQboApiResponseText", () => {
  it("parses valid JSON through unchanged", () => {
    expect(parseQboApiResponseText('{"billId":"123","success":true}', 200)).toEqual({
      billId: "123",
      success: true,
    });
  });

  it("gives a timeout-specific message for a 504 with a non-JSON body", () => {
    const result = parseQboApiResponseText("An error occurred with your deployment", 504);
    expect(result.error).toContain("timed out");
    expect(result.error).toContain("504");
  });

  it("gives a generic status-coded message for any other non-JSON body", () => {
    const result = parseQboApiResponseText("<html>Bad Gateway</html>", 502);
    expect(result.error).toContain("502");
  });

  it("never throws, even on empty or malformed input", () => {
    expect(() => parseQboApiResponseText("", 500)).not.toThrow();
    expect(() => parseQboApiResponseText("{not json", 500)).not.toThrow();
  });
});
