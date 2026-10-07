import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// docs/specs/accountant-team.md §6: with `readOnly` the selector offers every zone and shows every
// zone the driver is in, and cannot be changed. Without it, it behaves as it always has: a
// non-admin sees only the zones they manage.

const zones = [
  { id: "z-1", displayName: "North" },
  { id: "z-2", displayName: "South" },
  { id: "z-3", displayName: "East" },
];

vi.mock("@/components/providers/SystemProvider", () => {
  const chain: any = new Proxy(() => chain, {
    get: (_t, prop) => (prop === "compile" ? () => ({ sql: "", parameters: [] }) : chain),
    apply: () => chain,
  });
  return { db: chain };
});
vi.mock("@/lib/powersync/typedQuery", () => ({
  useTypedQuery: () => ({ data: zones }),
  expect: () => ({}),
}));

// zustand renders the initial state on the server, whatever `setState` did, so the store is
// replaced by a plain object the tests set.
let permissionsState = { isAdmin: false, accountManagerZoneIds: [] as string[] };
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (s: unknown) => unknown) => selector(permissionsState),
}));

const { SelectDriverZones } = await import("./SelectDriverZones");

const noop = () => {};

describe("SelectDriverZones", () => {
  beforeEach(() => {
    permissionsState = { isAdmin: false, accountManagerZoneIds: [] };
  });

  it("readOnly: shows every zone the driver is in, even though the viewer manages none", () => {
    const html = renderToStaticMarkup(
      <SelectDriverZones value={["z-1", "z-3"]} onChange={noop} readOnly />,
    );

    expect(html).toContain("North");
    expect(html).toContain("East");
    expect(html).not.toContain("South");
  });

  it("readOnly: the control is disabled", () => {
    const html = renderToStaticMarkup(
      <SelectDriverZones value={["z-1"]} onChange={noop} readOnly />,
    );

    expect(html).toMatch(/<button[^>]*\sdisabled=""/);
  });

  it("without readOnly, a person who manages no zone sees none selected — as before", () => {
    const html = renderToStaticMarkup(<SelectDriverZones value={["z-1", "z-3"]} onChange={noop} />);

    expect(html).not.toContain("North");
    expect(html).not.toContain("East");
  });

  it("without readOnly, an account manager sees only the zones they manage", () => {
    permissionsState = { isAdmin: false, accountManagerZoneIds: ["z-2"] };

    const html = renderToStaticMarkup(<SelectDriverZones value={["z-1", "z-2"]} onChange={noop} />);

    expect(html).toContain("South");
    expect(html).not.toContain("North");
  });

  it("without readOnly, an admin sees every zone and can change them", () => {
    permissionsState = { isAdmin: true, accountManagerZoneIds: [] };

    const html = renderToStaticMarkup(<SelectDriverZones value={["z-1", "z-2"]} onChange={noop} />);

    expect(html).toContain("North");
    expect(html).toContain("South");
    expect(html).not.toMatch(/<button[^>]*\sdisabled=""/);
  });
});
