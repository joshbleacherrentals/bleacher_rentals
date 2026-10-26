import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// docs/specs/qbo-invoice-12-event-type-services.md §4, §7.2.
// The component is called as a plain function and its returned element tree is read, so React's
// state and memo hooks are replaced by a small store (a setter applies its value, the next call to
// render() reads it back); the query hook and the API are mocked below.
const { store, query, fetchApi } = vi.hoisted(() => ({
  store: { slots: [] as unknown[], cursor: 0 },
  query: {
    result: { data: [] as unknown[], isLoading: false, error: null as unknown },
    options: null as any,
  },
  fetchApi: vi.fn(async (_c: string) => []),
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
  useMemo: (factory: () => unknown) => factory(),
}));
vi.mock("@tanstack/react-query", () => ({
  useQuery: (options: unknown) => {
    query.options = options;
    return query.result;
  },
}));
vi.mock("@/features/quickbooks-integration/api", () => ({
  fetchQboItems: (...args: [string]) => fetchApi(...args),
}));

const { SelectQboItemSimple } = await import("./SelectQboItemSimple");
const { QboConnectionError } = await import("./QboConnectionError");
const { CommandInput, CommandItem } = await import("@/components/ui/command");
const { Button } = await import("@/components/ui/button");

type Props = Parameters<typeof SelectQboItemSimple>[0];

const items = [
  { id: "1", name: "Bleacher Rental - City", fullyQualifiedName: "Bleacher Rental - City" },
  { id: "2", name: "Rural", fullyQualifiedName: "Rentals:Rural" },
  { id: "3", name: "Zebra", fullyQualifiedName: "Zebra" },
].map((i) => ({ ...i, type: "Service" }));

function render(props: Partial<Props> = {}) {
  store.cursor = 0;
  return (SelectQboItemSimple as (p: Props) => ReactNode)({
    connectionId: "conn-1",
    value: null,
    onChange: vi.fn(),
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

const itemRows = (tree: ReactElement<any>) => find(tree, (el) => el.type === CommandItem);
const trigger = (tree: ReactElement<any>) => find(tree, (el) => el.type === Button)[0];

beforeEach(() => {
  store.slots = [];
  store.cursor = 0;
  query.result = { data: items, isLoading: false, error: null };
  query.options = null;
  fetchApi.mockClear();
});

describe("SelectQboItemSimple — the list", () => {
  it("loads the Items of its own connection", async () => {
    render({ connectionId: "conn-9" });

    expect(query.options.queryKey).toEqual(["qbo-items", "conn-9"]);
    await query.options.queryFn();
    expect(fetchApi).toHaveBeenCalledWith("conn-9");
  });

  it("lists every Item under its fully qualified name", () => {
    const rows = itemRows(render());

    expect(rows.map((row) => textOf(row))).toEqual([
      "Bleacher Rental - City",
      "Rentals:Rural",
      "Zebra",
    ]);
  });

  it("filters the list by the search text, ignoring case", () => {
    render();
    const input = find(render(), (el) => el.type === CommandInput)[0];
    input.props.onValueChange("rural");

    const rows = itemRows(render());

    expect(rows.map((row) => textOf(row))).toEqual(["Rentals:Rural"]);
  });
});

describe("SelectQboItemSimple — picking", () => {
  it("calls onChange with the id of the Item picked", () => {
    const onChange = vi.fn();
    const rows = itemRows(render({ onChange }));

    rows[1].props.onSelect();

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith("2");
  });

  it("calls onChange with null when the selected Item is picked again", () => {
    const onChange = vi.fn();
    const rows = itemRows(render({ value: "2", onChange }));

    rows[1].props.onSelect();

    expect(onChange).toHaveBeenCalledWith(null);
  });

  it("calls onChange with the new id when another Item is picked", () => {
    const onChange = vi.fn();
    const rows = itemRows(render({ value: "2", onChange }));

    rows[2].props.onSelect();

    expect(onChange).toHaveBeenCalledWith("3");
  });
});

describe("SelectQboItemSimple — the trigger", () => {
  it("shows the placeholder when nothing is selected", () => {
    expect(textOf(trigger(render()))).toContain("Select QuickBooks Product/Service...");
  });

  it("shows the label of the selected Item", () => {
    expect(textOf(trigger(render({ value: "2" })))).toContain("Rentals:Rural");
  });

  it("shows a stored id that is not in the list as it is", () => {
    expect(textOf(trigger(render({ value: "999" })))).toContain("999");
  });

  it("shows a loading text and cannot be opened while the list loads", () => {
    query.result = { data: [], isLoading: true, error: null };

    const button = trigger(render({ value: "2" }));

    expect(textOf(button)).toContain("Loading products/services...");
    expect(button.props.disabled).toBe(true);
  });

  it("cannot be opened when it is disabled", () => {
    expect(trigger(render({ disabled: true })).props.disabled).toBe(true);
    expect(trigger(render()).props.disabled).toBeFalsy();
  });

  it("shows the connection error when the list fails to load", () => {
    query.result = { data: [], isLoading: false, error: new Error("boom") };

    const tree = render();

    expect(tree.type).toBe(QboConnectionError);
  });
});
