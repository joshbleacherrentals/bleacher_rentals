import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ReactElement, ReactNode } from "react";

// docs/specs/qbo-invoice-12a-quote-types-page.md §4, §7.
// The page is called as a plain function and its returned element tree is read, so React's state
// hook is replaced by a small store (a setter applies its value, the next call to render() reads it
// back); the queries, the types hook, the Supabase client and the toast are mocked below.
const { store, queries, queryClient, types, writes, errorToast, permissions, typeApi } = vi.hoisted(
  () => ({
    store: { slots: [] as unknown[], cursor: 0 },
    queries: {
      connections: [] as Array<{ id: string; display_name: string }>,
      stored: [] as Array<{
        event_type_uuid: string;
        qbo_connection_uuid: string;
        qbo_service_id: string;
      }>,
      storedError: null as unknown,
      options: {} as Record<string, any>,
    },
    queryClient: { invalidateQueries: vi.fn(async (_opts: unknown) => undefined) },
    types: { list: [] as Array<{ id: string; name: string }>, isLoading: false },
    writes: {
      upserts: [] as Array<{ table: string; row: unknown; options: unknown }>,
      deletes: [] as Array<{ table: string; filters: Array<[string, string]> }>,
      error: null as null | { message: string },
      // When set, a write waits for it instead of answering at once.
      hold: null as null | Promise<void>,
    },
    errorToast: vi.fn(),
    // Who is signed in (the permissions store), and the quote type writes of spec 12c.
    permissions: { roles: ["admin"] as string[], userId: "user-1" as string | null },
    typeApi: {
      create: vi.fn(async (_name: string, _by: string) => "new-id"),
      rename: vi.fn(async (_id: string, _name: string) => undefined),
      remove: vi.fn(async (_id: string, _name: string) => undefined),
      inUse: vi.fn(async (_id: string) => false),
    },
  }),
);

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
  useQuery: (options: { queryKey: string[] }) => {
    const name = options.queryKey[0];
    queries.options[name] = options;
    if (name === "qbo-connections") return { data: queries.connections };
    return { data: queries.stored, error: queries.storedError };
  },
  useQueryClient: () => queryClient,
}));
vi.mock("@/features/userAccess/state/usePermissionsStore", () => ({
  usePermissionsStore: (selector: (state: typeof permissions) => unknown) => selector(permissions),
}));
vi.mock("@/features/quotesAndBookings/db/eventTypes", () => ({
  createEventType: (...args: [string, string]) => typeApi.create(...args),
  renameEventType: (...args: [string, string]) => typeApi.rename(...args),
  deleteEventType: (...args: [string, string]) => typeApi.remove(...args),
  isEventTypeInUse: (...args: [string]) => typeApi.inUse(...args),
  eventTypeInUseMessage: (name: string) =>
    `${name} is used by quotes or prices, so it cannot be deleted.`,
}));
vi.mock("@/features/quotesAndBookings/hooks/useEventTypes", () => ({
  useEventTypes: () => ({ eventTypes: types.list, isLoading: types.isLoading }),
}));
vi.mock("@/features/quickbooks-integration/api", () => ({
  fetchQboConnections: vi.fn(async () => []),
}));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToastNoThrow: (...args: unknown[]) => errorToast(...args),
}));
vi.mock("@/utils/supabase/useClerkSupabaseClient", () => ({
  useClerkSupabaseClient: () => ({
    from: (table: string) => ({
      upsert: async (row: unknown, options: unknown) => {
        writes.upserts.push({ table, row, options });
        if (writes.hold) await writes.hold;
        return { error: writes.error };
      },
      delete: () => {
        const filters: Array<[string, string]> = [];
        const chain: any = {
          eq: (column: string, value: string) => {
            filters.push([column, value]);
            return chain;
          },
          then: (resolve: (v: unknown) => unknown) => {
            writes.deletes.push({ table, filters });
            return Promise.resolve(writes.hold).then(() => resolve({ error: writes.error }));
          },
        };
        return chain;
      },
      select: async () => ({ data: queries.stored, error: null }),
    }),
  }),
}));

const { default: QuoteTypesPage } = await import("./page");
const { PageHeader } = await import("@/components/PageHeader");
const { AlertDialog, AlertDialogAction } = await import("@/components/ui/alert-dialog");
const { SelectQboItemSimple } =
  await import("@/features/quickbooks-integration/components/SelectQboItemSimple");

function render() {
  store.cursor = 0;
  return (QuoteTypesPage as () => ReactNode)() as ReactElement<any>;
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

const cardOf = (tree: ReactElement<any>, typeId: string) =>
  find(tree, (el) => el.props?.["data-testid"] === `quote-type-${typeId}`)[0];
const rowOf = (tree: ReactElement<any>, typeId: string, connectionId: string) =>
  find(tree, (el) => el.props?.["data-testid"] === `quote-type-row-${typeId}-${connectionId}`)[0];
const selectOf = (tree: ReactElement<any>, typeId: string, connectionId: string) =>
  find(rowOf(tree, typeId, connectionId), (el) => el.type === SelectQboItemSimple)[0];

beforeEach(() => {
  store.slots = [];
  store.cursor = 0;
  queries.connections = [
    { id: "c-us", display_name: "Bleacher USA" },
    { id: "c-ca", display_name: "Bleacher Canada" },
  ];
  queries.stored = [];
  queries.storedError = null;
  queries.options = {};
  types.list = [
    { id: "t-city", name: "City" },
    { id: "t-rural", name: "Rural" },
  ];
  types.isLoading = false;
  writes.upserts = [];
  writes.deletes = [];
  writes.error = null;
  writes.hold = null;
  queryClient.invalidateQueries.mockClear();
  errorToast.mockClear();
  permissions.roles = ["admin"];
  permissions.userId = "user-1";
  for (const fn of Object.values(typeApi)) fn.mockClear();
  typeApi.create.mockImplementation(async () => "new-id");
  typeApi.rename.mockImplementation(async () => undefined);
  typeApi.remove.mockImplementation(async () => undefined);
  typeApi.inUse.mockImplementation(async () => false);
});

describe("Quote Types page — what it shows", () => {
  it("is headed Quote Types, with the subtitle", () => {
    const header = find(render(), (el) => el.type === PageHeader)[0];

    expect(header.props.title).toBe("Quote Types");
    expect(header.props.subtitle).toBe(
      "Choose the QuickBooks Product/Service each quote type is invoiced as, for each QuickBooks company.",
    );
  });

  it("draws a card per quote type and a row per connection in it", () => {
    const tree = render();

    for (const typeId of ["t-city", "t-rural"]) {
      expect(cardOf(tree, typeId), typeId).toBeDefined();
      for (const connectionId of ["c-us", "c-ca"]) {
        expect(selectOf(tree, typeId, connectionId), `${typeId}/${connectionId}`).toBeDefined();
      }
    }
    expect(textOf(cardOf(tree, "t-city"))).toContain("City");
    expect(textOf(rowOf(tree, "t-city", "c-ca"))).toContain("Bleacher Canada");
  });

  it("gives each picker its own connection", () => {
    const tree = render();

    expect(selectOf(tree, "t-city", "c-us").props.connectionId).toBe("c-us");
    expect(selectOf(tree, "t-city", "c-ca").props.connectionId).toBe("c-ca");
  });

  it("shows the stored assignment of each pair, and nothing for a pair that has none", () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
      { event_type_uuid: "t-rural", qbo_connection_uuid: "c-ca", qbo_service_id: "88" },
    ];

    const tree = render();

    expect(selectOf(tree, "t-city", "c-us").props.value).toBe("77");
    expect(selectOf(tree, "t-rural", "c-ca").props.value).toBe("88");
    expect(selectOf(tree, "t-city", "c-ca").props.value).toBeNull();
    expect(selectOf(tree, "t-rural", "c-us").props.value).toBeNull();
  });

  it("reads the assignments from the table, under its own query key", async () => {
    render();

    expect(queries.options["event-type-qbo-services"].queryKey).toEqual([
      "event-type-qbo-services",
    ]);
    const rows = await queries.options["event-type-qbo-services"].queryFn();
    expect(rows).toEqual(queries.stored);
  });

  it("says 'Loading quote types...' while the types load", () => {
    types.isLoading = true;
    types.list = [];

    expect(textOf(render())).toContain("Loading quote types...");
  });

  it("says 'No quote types.' when there are none", () => {
    types.list = [];

    expect(textOf(render())).toContain("No quote types.");
  });

  it("says 'No QuickBooks connections' in a card when there are none", () => {
    queries.connections = [];

    const tree = render();

    expect(textOf(cardOf(tree, "t-city"))).toContain("No QuickBooks connections");
  });

  it("shows an error instead of empty pickers when the saved assignments cannot be read", () => {
    queries.storedError = new Error("permission denied");

    const tree = render();

    expect(textOf(tree)).toContain("Could not load the saved Products/Services.");
    expect(find(tree, (el) => el.type === SelectQboItemSimple)).toEqual([]);
  });

  it("writes nothing before a choice is made", () => {
    render();

    expect(writes.upserts).toEqual([]);
    expect(writes.deletes).toEqual([]);
  });
});

describe("Quote Types page — choosing", () => {
  it("upserts the pair with the Item picked, on the pair's unique key", async () => {
    const tree = render();

    await selectOf(tree, "t-city", "c-us").props.onChange("77");

    expect(writes.upserts).toEqual([
      {
        table: "EventTypeQboServices",
        row: { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
        options: { onConflict: "event_type_uuid,qbo_connection_uuid" },
      },
    ]);
    expect(writes.deletes).toEqual([]);
  });

  it("refreshes the stored assignments after a save", async () => {
    const tree = render();

    await selectOf(tree, "t-city", "c-us").props.onChange("77");

    expect(queryClient.invalidateQueries).toHaveBeenCalledWith({
      queryKey: ["event-type-qbo-services"],
    });
  });

  it("deletes the pair's row when the Item is cleared", async () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
    ];
    const tree = render();

    await selectOf(tree, "t-city", "c-us").props.onChange(null);

    expect(writes.deletes).toEqual([
      {
        table: "EventTypeQboServices",
        filters: [
          ["event_type_uuid", "t-city"],
          ["qbo_connection_uuid", "c-us"],
        ],
      },
    ]);
    expect(writes.upserts).toEqual([]);
  });

  it("shows the Item picked at once, before the save has answered", () => {
    let release!: () => void;
    writes.hold = new Promise<void>((resolve) => {
      release = resolve;
    });
    const tree = render();

    const saving = selectOf(tree, "t-city", "c-us").props.onChange("77");

    expect(selectOf(render(), "t-city", "c-us").props.value).toBe("77");
    release();
    return saving;
  });

  it("shows a cleared pair as empty at once", () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
    ];
    let release!: () => void;
    writes.hold = new Promise<void>((resolve) => {
      release = resolve;
    });

    const saving = selectOf(render(), "t-city", "c-us").props.onChange(null);

    expect(selectOf(render(), "t-city", "c-us").props.value).toBeNull();
    release();
    return saving;
  });

  it("changes only the pair that was chosen", async () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
    ];

    await selectOf(render(), "t-rural", "c-ca").props.onChange("88");

    const tree = render();
    expect(selectOf(tree, "t-city", "c-us").props.value).toBe("77");
    expect(selectOf(tree, "t-rural", "c-us").props.value).toBeNull();
    expect(selectOf(tree, "t-city", "c-ca").props.value).toBeNull();
  });

  it("puts the old value back and shows an error toast when the save fails", async () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
    ];
    writes.error = { message: "permission denied" };

    await selectOf(render(), "t-city", "c-us").props.onChange("99");

    expect(selectOf(render(), "t-city", "c-us").props.value).toBe("77");
    expect(errorToast).toHaveBeenCalledTimes(1);
    const lines = errorToast.mock.calls[0][0] as string[];
    expect(lines[0]).toContain("Failed to save");
    expect(lines.join(" ")).toContain("permission denied");
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
  });

  it("puts a cleared Item back when the delete fails", async () => {
    queries.stored = [
      { event_type_uuid: "t-city", qbo_connection_uuid: "c-us", qbo_service_id: "77" },
    ];
    writes.error = { message: "permission denied" };

    await selectOf(render(), "t-city", "c-us").props.onChange(null);

    expect(selectOf(render(), "t-city", "c-us").props.value).toBe("77");
    expect(errorToast).toHaveBeenCalledTimes(1);
  });
});

// docs/specs/qbo-invoice-12c-manage-quote-types.md §4, §7: an admin adds, renames and deletes quote
// types on the page; nobody else sees the controls.
describe("Quote Types page — managing the types (spec 12c)", () => {
  const byId = (tree: ReactNode, testId: string) =>
    find(tree, (el) => el.props?.["data-testid"] === testId)[0];
  const headerAction = (tree: ReactElement<any>) =>
    find(tree, (el) => el.type === PageHeader)[0].props.action as ReactNode;
  const addButton = (tree: ReactElement<any>) => byId(headerAction(tree), "add-quote-type");
  const dialogOf = (tree: ReactElement<any>) => find(tree, (el) => el.type === AlertDialog)[0];
  const confirmOf = (tree: ReactElement<any>) =>
    find(dialogOf(tree), (el) => el.type === AlertDialogAction)[0];

  describe("who sees the controls", () => {
    it("an admin sees Add quote type, and Rename and Delete on each card", () => {
      const tree = render();

      expect(textOf(addButton(tree))).toContain("Add quote type");
      for (const typeId of ["t-city", "t-rural"]) {
        expect(byId(tree, `rename-quote-type-${typeId}`), typeId).toBeDefined();
        expect(byId(tree, `delete-quote-type-${typeId}`), typeId).toBeDefined();
      }
    });

    it("an accountant sees none of them, and still sees the pickers", () => {
      permissions.roles = ["accountant"];

      const tree = render();

      expect(headerAction(tree)).toBeFalsy();
      expect(byId(tree, "rename-quote-type-t-city")).toBeUndefined();
      expect(byId(tree, "delete-quote-type-t-city")).toBeUndefined();
      expect(find(tree, (el) => el.type === AlertDialog)).toEqual([]);
      expect(selectOf(tree, "t-city", "c-us")).toBeDefined();
    });

    it("an admin who is also an accountant sees them", () => {
      permissions.roles = ["accountant", "admin"];

      expect(addButton(render())).toBeDefined();
    });

    it("an admin still has Add when there are no types", () => {
      types.list = [];

      const tree = render();

      expect(textOf(tree)).toContain("No quote types.");
      expect(addButton(tree)).toBeDefined();
    });
  });

  describe("adding", () => {
    it("opens a name field, and creates the type with the typed name and the signed-in user", async () => {
      expect(byId(render(), "add-quote-type-input")).toBeUndefined();
      addButton(render()).props.onClick();

      byId(render(), "add-quote-type-input").props.onChange({ target: { value: "Sale" } });
      await byId(render(), "add-quote-type-submit").props.onClick();

      expect(typeApi.create).toHaveBeenCalledTimes(1);
      expect(typeApi.create).toHaveBeenCalledWith("Sale", "user-1");
      expect(byId(render(), "add-quote-type-input")).toBeUndefined();
      expect(errorToast).not.toHaveBeenCalled();
    });

    it("keeps the field open, with the typed name, and shows the toast when the create fails", async () => {
      typeApi.create.mockRejectedValueOnce(new Error("Enter a name for the quote type."));
      addButton(render()).props.onClick();
      byId(render(), "add-quote-type-input").props.onChange({ target: { value: "  " } });

      await byId(render(), "add-quote-type-submit").props.onClick();

      const input = byId(render(), "add-quote-type-input");
      expect(input).toBeDefined();
      expect(input.props.value).toBe("  ");
      expect(errorToast).toHaveBeenCalledTimes(1);
      const lines = errorToast.mock.calls[0][0] as string[];
      expect(lines[0]).toContain("Failed to add the quote type");
      expect(lines.join(" ")).toContain("Enter a name for the quote type.");
    });

    it("Cancel closes the field and creates nothing", () => {
      addButton(render()).props.onClick();
      byId(render(), "add-quote-type-input").props.onChange({ target: { value: "Sale" } });

      byId(render(), "add-quote-type-cancel").props.onClick();

      expect(byId(render(), "add-quote-type-input")).toBeUndefined();
      expect(typeApi.create).not.toHaveBeenCalled();
    });

    it("opens the field empty the next time", async () => {
      addButton(render()).props.onClick();
      byId(render(), "add-quote-type-input").props.onChange({ target: { value: "Sale" } });
      await byId(render(), "add-quote-type-submit").props.onClick();

      addButton(render()).props.onClick();

      expect(byId(render(), "add-quote-type-input").props.value).toBe("");
    });

    it("creates nothing, and says why, when the signed-in user is not known", async () => {
      permissions.userId = null;
      addButton(render()).props.onClick();
      byId(render(), "add-quote-type-input").props.onChange({ target: { value: "Sale" } });

      await byId(render(), "add-quote-type-submit").props.onClick();

      expect(typeApi.create).not.toHaveBeenCalled();
      expect(errorToast).toHaveBeenCalledTimes(1);
    });
  });

  describe("renaming", () => {
    it("turns the name into a field holding the current name, and saves the new one", async () => {
      expect(textOf(cardOf(render(), "t-city"))).toContain("City");
      byId(render(), "rename-quote-type-t-city").props.onClick();

      const input = byId(render(), "rename-quote-type-input-t-city");
      expect(input.props.value).toBe("City");
      input.props.onChange({ target: { value: "Town" } });
      await byId(render(), "rename-quote-type-save-t-city").props.onClick();

      expect(typeApi.rename).toHaveBeenCalledTimes(1);
      expect(typeApi.rename).toHaveBeenCalledWith("t-city", "Town");
      expect(byId(render(), "rename-quote-type-input-t-city")).toBeUndefined();
    });

    it("keeps the field open and shows the toast when the save fails", async () => {
      typeApi.rename.mockRejectedValueOnce(new Error("Enter a name for the quote type."));
      byId(render(), "rename-quote-type-t-city").props.onClick();
      byId(render(), "rename-quote-type-input-t-city").props.onChange({ target: { value: " " } });

      await byId(render(), "rename-quote-type-save-t-city").props.onClick();

      expect(byId(render(), "rename-quote-type-input-t-city")).toBeDefined();
      expect(errorToast).toHaveBeenCalledTimes(1);
      expect((errorToast.mock.calls[0][0] as string[])[0]).toContain(
        "Failed to rename the quote type",
      );
    });

    it("Cancel closes the field and renames nothing", () => {
      byId(render(), "rename-quote-type-t-city").props.onClick();
      byId(render(), "rename-quote-type-input-t-city").props.onChange({
        target: { value: "Town" },
      });

      byId(render(), "rename-quote-type-cancel-t-city").props.onClick();

      expect(byId(render(), "rename-quote-type-input-t-city")).toBeUndefined();
      expect(typeApi.rename).not.toHaveBeenCalled();
      expect(textOf(cardOf(render(), "t-city"))).toContain("City");
    });

    it("renames only the card it was opened on", () => {
      byId(render(), "rename-quote-type-t-city").props.onClick();

      expect(byId(render(), "rename-quote-type-input-t-rural")).toBeUndefined();
    });
  });

  describe("deleting", () => {
    it("on a type that is in use: shows the toast, asks nothing and deletes nothing", async () => {
      typeApi.inUse.mockResolvedValueOnce(true);

      await byId(render(), "delete-quote-type-t-city").props.onClick();

      expect(typeApi.inUse).toHaveBeenCalledWith("t-city");
      expect(errorToast).toHaveBeenCalledTimes(1);
      const lines = errorToast.mock.calls[0][0] as string[];
      expect(lines.join(" ")).toContain(
        "City is used by quotes or prices, so it cannot be deleted.",
      );
      expect(dialogOf(render()).props.open).toBe(false);
      expect(typeApi.remove).not.toHaveBeenCalled();
    });

    it("on a free type: asks first, and deletes nothing until it is confirmed", async () => {
      await byId(render(), "delete-quote-type-t-rural").props.onClick();

      const dialog = dialogOf(render());
      expect(dialog.props.open).toBe(true);
      expect(textOf(dialog)).toContain(
        "Delete quote type Rural? It disappears from the quote form and the Pricing Matrix.",
      );
      expect(typeApi.remove).not.toHaveBeenCalled();
    });

    it("deletes the type, with its name, when the confirmation is pressed, and closes", async () => {
      await byId(render(), "delete-quote-type-t-rural").props.onClick();

      await confirmOf(render()).props.onClick();

      expect(typeApi.remove).toHaveBeenCalledTimes(1);
      expect(typeApi.remove).toHaveBeenCalledWith("t-rural", "Rural");
      expect(dialogOf(render()).props.open).toBe(false);
      expect(errorToast).not.toHaveBeenCalled();
    });

    it("Cancel (the dialog closing) deletes nothing", async () => {
      await byId(render(), "delete-quote-type-t-rural").props.onClick();

      dialogOf(render()).props.onOpenChange(false);

      expect(dialogOf(render()).props.open).toBe(false);
      expect(typeApi.remove).not.toHaveBeenCalled();
    });

    it("shows the toast and closes when the delete fails after the confirmation", async () => {
      typeApi.remove.mockRejectedValueOnce(
        new Error("Rural is used by quotes or prices, so it cannot be deleted."),
      );
      await byId(render(), "delete-quote-type-t-rural").props.onClick();

      await confirmOf(render()).props.onClick();

      expect(errorToast).toHaveBeenCalledTimes(1);
      expect((errorToast.mock.calls[0][0] as string[])[0]).toContain(
        "Failed to delete the quote type",
      );
      expect(dialogOf(render()).props.open).toBe(false);
    });

    it("shows the toast and opens no dialog when the usage cannot be read", async () => {
      typeApi.inUse.mockRejectedValueOnce(new Error("local database unavailable"));

      await byId(render(), "delete-quote-type-t-city").props.onClick();

      expect(errorToast).toHaveBeenCalledTimes(1);
      expect(dialogOf(render()).props.open).toBe(false);
      expect(typeApi.remove).not.toHaveBeenCalled();
    });
  });
});
