import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToString } from "react-dom/server";

// docs/specs/accountant-audit-02-driver-select.md §3 and §5.
const useDrivers = vi.fn();
vi.mock("@/features/workTrackers/hooks/useDrivers.db", () => ({
  useDrivers: (...a: unknown[]) => useDrivers(...a),
}));

import { useAuditDriverOptions } from "./useAuditDriverOptions";

const d = (id: string, first: string) => ({
  driver_uuid: id,
  user_id: `c-${id}`,
  first_name: first,
  last_name: "Roe",
  email: `${id}@x.com`,
  is_active: 1,
});

let result: ReturnType<typeof useAuditDriverOptions>;
function Probe() {
  result = useAuditDriverOptions();
  return null;
}

beforeEach(() => useDrivers.mockReset());

describe("useAuditDriverOptions", () => {
  it("asks useDrivers for showAll and includeInactive and returns sorted options", () => {
    useDrivers.mockReturnValue({ data: [d("2", "Zed"), d("1", "Ann")], isLoading: false });
    renderToString(<Probe />);
    expect(useDrivers).toHaveBeenCalledWith({ showAll: true, includeInactive: true });
    expect(result.options.map((o) => o.id)).toEqual(["1", "2"]);
    expect(result.isLoading).toBe(false);
  });

  it("returns no options and the loading flag while loading", () => {
    useDrivers.mockReturnValue({ data: null, isLoading: true });
    renderToString(<Probe />);
    expect(result).toEqual({ options: [], isLoading: true });
  });
});
