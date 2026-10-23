import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";
import { CANADIAN_PROVINCES } from "@/features/quotesAndBookings/utils/canadianTaxRates";

// docs/specs/qbo-invoice-03a-province-tax-codes.md §4, §7.2.
// The component is called as a plain function and its returned element tree is read, so React's
// state hook is replaced by a small store (a setter applies its value, the next call to render()
// reads it back); every other hook it uses is mocked below.
const { store, query, queryClient, saveApi, fetchApi, errorToast } = vi.hoisted(() => ({
  store: { slots: [] as unknown[], cursor: 0 },
  query: { data: [] as Array<{ province: string; qbo_tax_code_id: string }>, options: null as any },
  queryClient: { invalidateQueries: vi.fn(async () => undefined) },
  saveApi: vi.fn(async (_c: string, _p: string, _id: string | null) => undefined),
  fetchApi: vi.fn(async (_c: string) => []),
  errorToast: vi.fn(),
}));

vi.mock("react", async (importOriginal) => ({
  ...(await importOriginal<typeof import("react")>()),
  useState: (initial: unknown) => {
    const index = store.cursor++;
    if (!(index in store.slots)) {
      store.slots[index] = typeof initial === "function" ? (initial as () => unknown)() : initial;
    }
    const set = (next: unknown) => {
      store.slots[index] =
        typeof next === "function"
          ? (next as (prev: unknown) => unknown)(store.slots[index])
          : next;
    };
    return [store.slots[index], set];
  },
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    query.options = options;
    return { data: query.data };
  },
  useQueryClient: () => queryClient,
}));
vi.mock("../api", () => ({
  fetchProvinceTaxCodes: (...args: [string]) => fetchApi(...args),
  setProvinceTaxCodeApi: (...args: [string, string, string | null]) => saveApi(...args),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (...args: unknown[]) => errorToast(...args),
}));

const { ProvinceTaxCodes } = await import("./ProvinceTaxCodes");

type Props = Parameters<typeof ProvinceTaxCodes>[0];

const taxCodes = [
  { id: "5", name: "HST ON 13%", description: null, taxable: true },
  { id: "7", name: "GST/QST QC", description: null, taxable: true },
];

function render(props: Partial<Props> = {}) {
  store.cursor = 0;
  return (ProvinceTaxCodes as (p: Props) => ReactNode)({
    connectionId: "conn-1",
    taxCodes,
    ...props,
  }) as ReactElement<any>;
}

function find(node: ReactNode, test: (el: ReactElement<any>) => boolean): ReactElement<any>[] {
  if (!node || typeof node !== "object") return [];
  if (Array.isArray(node)) return node.flatMap((child) => find(child, test));
  const element = node as ReactElement<any>;
  return [...(test(element) ? [element] : []), ...find(element.props?.children, test)];
}

function textOf(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf((node as ReactElement<any>).props?.children);
}

const rowOf = (tree: ReactElement<any>, code: string) =>
  find(tree, (el) => el.props?.["data-testid"] === `province-row-${code}`)[0];
const selectOf = (tree: ReactElement<any>, code: string) =>
  find(rowOf(tree, code), (el) => el.type === "select")[0];
const optionsOf = (select: ReactElement<any>) =>
  find(select, (el) => el.type === "option").map((o) => [o.props.value, textOf(o)]);

beforeEach(() => {
  store.slots = [];
  store.cursor = 0;
  query.data = [];
  query.options = null;
  queryClient.invalidateQueries.mockClear();
  saveApi.mockReset();
  saveApi.mockResolvedValue(undefined);
  fetchApi.mockClear();
  errorToast.mockClear();
});

describe("ProvinceTaxCodes — the rows", () => {
  it("is headed 'Tax code per Canadian province' and collapsible", () => {
    const tree = render();

    const summary = find(tree, (el) => el.type === "summary")[0];
    expect(tree.type).toBe("details");
    expect(textOf(summary)).toContain("Tax code per Canadian province");
  });

  it("lists the 13 provinces in the table's order", () => {
    const tree = render();

    const rows = find(tree, (el) =>
      String(el.props?.["data-testid"] ?? "").startsWith("province-row-"),
    );
    expect(rows.map((r) => r.props["data-testid"])).toEqual(
      Object.keys(CANADIAN_PROVINCES).map((code) => `province-row-${code}`),
    );
    expect(rows).toHaveLength(13);
  });

  it("shows each province's name, rate and label from the rate table", () => {
    const tree = render();

    for (const [code, info] of Object.entries(CANADIAN_PROVINCES)) {
      const text = textOf(rowOf(tree, code));
      expect(text, code).toContain(info.name);
      expect(text, code).toContain(`${info.taxPercent}%`);
      expect(text, code).toContain(info.label);
    }
  });

  it("loads the stored rows of its own connection", async () => {
    render({ connectionId: "conn-9" });

    expect(query.options.queryKey).toEqual(["province-tax-codes", "conn-9"]);
    await query.options.queryFn();
    expect(fetchApi).toHaveBeenCalledWith("conn-9");
  });
});

describe("ProvinceTaxCodes — the tax codes are loaded", () => {
  it("offers '— none —' and the connection's tax codes in every select", () => {
    const tree = render();

    for (const code of Object.keys(CANADIAN_PROVINCES)) {
      expect(optionsOf(selectOf(tree, code)), code).toEqual([
        ["", "— none —"],
        ["5", "HST ON 13%"],
        ["7", "GST/QST QC"],
      ]);
    }
  });

  it("preselects the stored code, and '— none —' where there is none", () => {
    query.data = [{ province: "ON", qbo_tax_code_id: "5" }];

    const tree = render();

    expect(selectOf(tree, "ON").props.value).toBe("5");
    expect(selectOf(tree, "QC").props.value).toBe("");
  });

  it("keeps a stored id that QuickBooks no longer lists, and shows it", () => {
    query.data = [{ province: "ON", qbo_tax_code_id: "404" }];

    const tree = render();

    expect(selectOf(tree, "ON").props.value).toBe("404");
    expect(optionsOf(selectOf(tree, "ON"))).toContainEqual(["404", "404"]);
    expect(optionsOf(selectOf(tree, "QC")).map(([value]) => value)).not.toContain("404");
  });
});

describe("ProvinceTaxCodes — choosing", () => {
  it("saves the province and the chosen id", async () => {
    await selectOf(render(), "ON").props.onChange({ target: { value: "5" } });

    expect(saveApi).toHaveBeenCalledTimes(1);
    expect(saveApi).toHaveBeenCalledWith("conn-1", "ON", "5");
  });

  it("saves null for '— none —'", async () => {
    query.data = [{ province: "ON", qbo_tax_code_id: "5" }];

    await selectOf(render(), "ON").props.onChange({ target: { value: "" } });

    expect(saveApi).toHaveBeenCalledWith("conn-1", "ON", null);
  });

  it("shows the new value at once, before the save answers", async () => {
    let answer: () => void = () => {};
    saveApi.mockImplementation(
      () => new Promise<undefined>((resolve) => (answer = () => resolve(undefined))),
    );

    const saving = selectOf(render(), "ON").props.onChange({ target: { value: "5" } });

    expect(selectOf(render(), "ON").props.value).toBe("5");
    answer();
    await saving;
    expect(selectOf(render(), "ON").props.value).toBe("5");
  });

  it("refreshes the stored rows after a save", async () => {
    await selectOf(render(), "ON").props.onChange({ target: { value: "5" } });

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["province-tax-codes", "conn-1"],
    });
    expect(errorToast).not.toHaveBeenCalled();
  });

  it("puts the old value back and shows an error toast when the save fails", async () => {
    query.data = [{ province: "ON", qbo_tax_code_id: "5" }];
    saveApi.mockRejectedValue(new Error("Forbidden"));

    await selectOf(render(), "ON").props.onChange({ target: { value: "7" } });

    expect(selectOf(render(), "ON").props.value).toBe("5");
    expect(errorToast).toHaveBeenCalledTimes(1);
    expect(errorToast.mock.calls[0][0].join(" ")).toContain("Ontario");
    expect(errorToast.mock.calls[0][0].join(" ")).toContain("Forbidden");
  });

  it("restores '— none —' when the first choice for a province fails", async () => {
    saveApi.mockRejectedValue(new Error("Forbidden"));

    await selectOf(render(), "QC").props.onChange({ target: { value: "7" } });

    expect(selectOf(render(), "QC").props.value).toBe("");
    expect(errorToast).toHaveBeenCalledTimes(1);
  });

  it("changes only the province that was chosen", async () => {
    query.data = [{ province: "QC", qbo_tax_code_id: "7" }];

    await selectOf(render(), "ON").props.onChange({ target: { value: "5" } });

    expect(selectOf(render(), "ON").props.value).toBe("5");
    expect(selectOf(render(), "QC").props.value).toBe("7");
  });
});

describe("ProvinceTaxCodes — the tax codes are not loaded", () => {
  it("draws no select, so nothing can be changed", () => {
    const tree = render({ taxCodes: undefined });

    expect(find(tree, (el) => el.type === "select")).toHaveLength(0);
  });

  it("shows the stored ids, and '— none —' for a province without one", () => {
    query.data = [
      { province: "ON", qbo_tax_code_id: "stored-on" },
      { province: "QC", qbo_tax_code_id: "stored-qc" },
    ];

    const tree = render({ taxCodes: undefined });

    expect(textOf(rowOf(tree, "ON"))).toContain("stored-on");
    expect(textOf(rowOf(tree, "QC"))).toContain("stored-qc");
    expect(textOf(rowOf(tree, "QC"))).not.toContain("stored-on");
    expect(textOf(rowOf(tree, "AB"))).toContain("— none —");
  });
});
