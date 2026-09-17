import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { GoToCurrentSprintLink } from "./GoToCurrentSprintLink";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";

const sprint = {
  id: "71d6e0b4-ffaa-42c5-9e58-5928044b24e3",
  quarter_id: "e8bba0cb-40bb-4f80-87fe-67782dfbe730",
};

const render = (roles: WebRole[], s: typeof sprint | null = sprint) =>
  renderToStaticMarkup(<GoToCurrentSprintLink roles={roles} sprint={s} />);

describe("GoToCurrentSprintLink", () => {
  it("links a developer straight to the running sprint", () => {
    const html = render(["developer"]);
    expect(html).toContain("Go to current sprint");
    expect(html).toContain(
      'href="/roadmap/e8bba0cb-40bb-4f80-87fe-67782dfbe730/sprint/71d6e0b4-ffaa-42c5-9e58-5928044b24e3"',
    );
  });

  it("shows when developer is one of several roles", () => {
    expect(render(["admin", "developer"])).toContain("Go to current sprint");
  });

  it("stays hidden for users without the developer role", () => {
    expect(render(["admin"])).toBe("");
    expect(render(["account_manager", "viewer"])).toBe("");
  });

  it("stays hidden when there is no current sprint", () => {
    expect(render(["developer"], null)).toBe("");
  });
});
