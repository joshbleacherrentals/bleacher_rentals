import { describe, it, expect, vi, beforeEach } from "vitest";
import type { ReactElement, ReactNode } from "react";

// The component is called as a plain function and its returned element tree is read, so React's
// state hook is stubbed; every other hook it uses is mocked below.
vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => [initial, vi.fn()],
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@clerk/nextjs", () => ({ useUser: () => ({ user: { id: "clerk-1" } }) }));
vi.mock("@/features/dashboard/db/hooks/powersync/usePsUsers", () => ({
  usePsUsers: () => [{ id: "me", clerk_user_id: "clerk-1" }],
}));
vi.mock("../db/attentionTrackers", () => ({ useAttentionCountsByDriver: () => new Map() }));
vi.mock("@/components/LoadingSpinner", () => ({ default: () => null }));
vi.mock("./PaymentStatusButton", () => ({ PaymentStatusButton: () => null }));
vi.mock("./MarkPaidButton", () => ({ MarkPaidButton: () => null }));
vi.mock("./TotalsMatch", () => ({ TotalsMatch: () => null }));
vi.mock("./AttentionBadgeSlot", () => ({ AttentionBadgeSlot: () => null }));

let currentDrivers: { driver_uuid: string; id: string; first_name: string; last_name: string }[];

vi.mock("../hooks/useDriversForWeek", () => ({
  useWorkTrackerAccess: () => ({
    access: { isAdmin: true, isAccountManager: false, isAccountant: false },
    isLoading: false,
  }),
  useDriversForWeek: () => ({ drivers: currentDrivers, isLoading: false }),
}));

const { DriverListForWeek } = await import("./DriverListForWeek");

function driver(uuid: string) {
  return { driver_uuid: uuid, id: `user-${uuid}`, first_name: uuid, last_name: "Test" };
}

/** Every `<tr>` in the returned tree that is a driver row (it navigates on click). */
function driverRows(node: ReactNode): ReactElement<any>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap(driverRows);
  const element = node as ReactElement<any>;
  const own = element.type === "tr" && element.props?.onClick ? [element] : [];
  return [...own, ...driverRows(element.props?.children)];
}

function render() {
  return driverRows(
    (DriverListForWeek as (p: { startDate: string }) => ReactNode)({ startDate: "2026-10-05" }),
  );
}

describe("DriverListForWeek — row identity", () => {
  beforeEach(() => {
    currentDrivers = [];
  });

  // The bug: rows were keyed by index, so filtering to USA drivers moved a USA driver into the
  // slot a Canadian driver had held, and the row (with its payment window's state) stayed put.
  it("keys each row by its driver, not by its position", () => {
    currentDrivers = [driver("can-1"), driver("usa-1"), driver("usa-2")];

    expect(render().map((row) => row.key)).toEqual(["can-1", "usa-1", "usa-2"]);
  });

  it("gives a driver the same key before and after the list is filtered", () => {
    currentDrivers = [driver("can-1"), driver("usa-1"), driver("usa-2")];
    const before = render().map((row) => row.key);

    currentDrivers = [driver("usa-1"), driver("usa-2")];
    const after = render().map((row) => row.key);

    expect(after).toEqual(["usa-1", "usa-2"]);
    expect(before.indexOf("usa-1")).not.toBe(after.indexOf("usa-1"));
  });
});
