import { describe, expect, it } from "vitest";
import { emailStatusLabel, toEmailStatus } from "./emailStatus";

describe("toEmailStatus", () => {
  it("keeps the three unsent statuses", () => {
    expect(toEmailStatus("draft")).toBe("draft");
    expect(toEmailStatus("sending")).toBe("sending");
    expect(toEmailStatus("error")).toBe("error");
  });

  it("treats success, a missing status and anything unknown as a normal email", () => {
    expect(toEmailStatus("success")).toBe("success");
    expect(toEmailStatus(null)).toBe("success");
    expect(toEmailStatus(undefined)).toBe("success");
    expect(toEmailStatus("queued")).toBe("success");
  });
});

describe("emailStatusLabel", () => {
  it("labels an unsent email and says nothing for a normal one", () => {
    expect(emailStatusLabel("sending")).toBe("Sending...");
    expect(emailStatusLabel("error")).toBe("Not sent");
    expect(emailStatusLabel("draft")).toBe("Draft");
    expect(emailStatusLabel("success")).toBeNull();
  });
});
