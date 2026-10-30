import { beforeEach, describe, expect, it, vi } from "vitest";
import { Fragment, isValidElement, type ReactElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/qbo-invoice-07-card-buttons.md §4 (the buttons and the three windows) and §9
// ("closing a window by clicking outside is Cancel"). There is no DOM here, so the dialog primitives
// are replaced by plain frames that keep the one prop that matters, `onOpenChange`, ConfirmDialog by
// a hook-free stand-in, and the drawn trees are walked and pressed without a browser.

const captured = vi.hoisted(() => ({
  onOpenChange: undefined as ((open: boolean) => void) | undefined,
}));
const mocks = vi.hoisted(() => ({
  invoiceState: vi.fn(),
}));

vi.mock("@/components/ui/dialog", () => {
  const frame = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    Dialog: ({
      open,
      onOpenChange,
      children,
    }: {
      open: boolean;
      onOpenChange?: (open: boolean) => void;
      children?: React.ReactNode;
    }) => {
      captured.onOpenChange = onOpenChange;
      return open ? <div>{children}</div> : null;
    },
    DialogContent: frame,
    DialogHeader: frame,
    DialogTitle: frame,
    DialogDescription: frame,
    DialogFooter: frame,
  };
});

vi.mock("@/components/ConfirmDialog", () => ({
  ConfirmDialog: (props: {
    open: boolean;
    title: string;
    message?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    destructive?: boolean;
    onConfirm: () => void;
    onCancel: () => void;
  }) =>
    props.open ? (
      <div role="alertdialog" data-destructive={String(props.destructive ?? true)}>
        <h2>{props.title}</h2>
        <p>{props.message}</p>
        <button onClick={props.onCancel}>{props.cancelLabel ?? "Cancel"}</button>
        <button onClick={props.onConfirm}>{props.confirmLabel ?? "Delete"}</button>
      </div>
    ) : null,
}));
vi.mock("@/components/toasts/SuccessToast", () => ({ createSuccessToast: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({
  createErrorToast: vi.fn(),
  createErrorToastNoThrow: vi.fn(),
}));
vi.mock("./useInvoiceState", () => ({ useInvoiceState: () => mocks.invoiceState() }));
// The check time reads the local database; its own test (InvoiceCheckTime.test.tsx) covers that.
vi.mock("./InvoiceCheckTime", () => ({
  InvoiceCheckTime: ({ eventId }: { eventId: string }) => (
    <p data-testid="check-time">{`check time of ${eventId}`}</p>
  ),
}));

import { CustomerChoiceDialog } from "./CustomerChoiceDialog";
import { InvoiceButtons, InvoiceButtonsView, InvoiceDialogs } from "./InvoiceButtons";
import { InvoiceNotFoundDialog } from "./InvoiceNotFoundDialog";
import { InvoiceNumberExistsDialog } from "./InvoiceNumberExistsDialog";
import type { InvoiceDialog } from "./invoiceActions";

/** The tree the windows draw, with every (hook-free) function component expanded to elements. */
function expand(node: ReactNode): ReactNode {
  if (Array.isArray(node)) return node.map(expand);
  if (!isValidElement(node)) return node;
  const element = node as ReactElement<{ children?: ReactNode }>;
  const type: unknown = element.type;
  if (typeof type === "function") {
    return expand((type as (props: unknown) => ReactNode)(element.props));
  }
  if (type === Fragment || typeof type === "string") {
    return { ...element, props: { ...element.props, children: expand(element.props.children) } };
  }
  return element;
}

const textOf = (node: ReactNode): string => {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(textOf).join("");
  return textOf((node as ReactElement<{ children?: ReactNode }>).props.children);
};

function buttons(node: ReactNode): ReactElement<{ onClick?: () => void; children?: ReactNode }>[] {
  const found: ReactElement<{ onClick?: () => void; children?: ReactNode }>[] = [];
  const visit = (current: ReactNode) => {
    if (Array.isArray(current)) return current.forEach(visit);
    if (!isValidElement(current)) return;
    const element = current as ReactElement<{ onClick?: () => void; children?: ReactNode }>;
    if (element.type === "button") found.push(element);
    visit(element.props.children);
  };
  visit(node);
  return found;
}

const press = (tree: ReactNode, label: string, nth = 0) => {
  const matches = buttons(tree).filter((button) => textOf(button.props.children) === label);
  expect(matches.length, `a button labelled "${label}"`).toBeGreaterThan(nth);
  matches[nth].props.onClick?.();
};

beforeEach(() => {
  captured.onOpenChange = undefined;
});

const CANDIDATES = [
  { id: "C1", displayName: "Dana Whitfield", companyName: "Riverside High", email: "dana@r.edu" },
  { id: "C2", displayName: "Dana W.", companyName: null, email: null },
];

describe("CustomerChoiceDialog", () => {
  const draw = (over: Partial<Parameters<typeof CustomerChoiceDialog>[0]> = {}) => {
    const onChoose = vi.fn();
    const onCancel = vi.fn();
    const props = { candidates: CANDIDATES, onChoose, onCancel, ...over };
    return { onChoose, onCancel, tree: expand(CustomerChoiceDialog(props)), props };
  };

  it("S5: lists each candidate's name, company and email", () => {
    const html = renderToStaticMarkup(<CustomerChoiceDialog {...draw().props} />);
    expect(html).toContain("Dana Whitfield");
    expect(html).toContain("Riverside High");
    expect(html).toContain("dana@r.edu");
    expect(html).toContain("Dana W.");
  });

  it("shows nothing it was not given: no company or email text for a candidate without them", () => {
    const html = renderToStaticMarkup(
      <CustomerChoiceDialog candidates={[CANDIDATES[1]]} onChoose={() => {}} onCancel={() => {}} />,
    );
    expect(html).toContain("Dana W.");
    expect(html).not.toContain("null");
    expect(html).not.toContain("undefined");
  });

  it("S5: has a 'Use this customer' button on each candidate, and each answers with its own customer", () => {
    const { tree, onChoose } = draw();
    expect(
      buttons(tree).filter((b) => textOf(b.props.children) === "Use this customer"),
    ).toHaveLength(2);

    press(tree, "Use this customer", 1);

    expect(onChoose).toHaveBeenCalledTimes(1);
    expect(onChoose).toHaveBeenCalledWith({ kind: "existing", customerId: "C2" });
  });

  it("S5: 'Create a new customer' answers { kind: 'new' }", () => {
    const { tree, onChoose } = draw();
    press(tree, "Create a new customer");
    expect(onChoose).toHaveBeenCalledWith({ kind: "new" });
  });

  it("Cancel calls onCancel and answers nothing", () => {
    const { tree, onChoose, onCancel } = draw();
    press(tree, "Cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("closing it by clicking outside is Cancel", () => {
    const { onChoose, onCancel } = draw();

    captured.onOpenChange?.(false);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onChoose).not.toHaveBeenCalled();
  });

  it("an open-state change to 'open' is not a Cancel", () => {
    const { onCancel } = draw();

    captured.onOpenChange?.(true);

    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe("InvoiceNumberExistsDialog", () => {
  const invoice = {
    id: "inv-77",
    number: "900000001",
    customerName: "Riverside High",
    totalCents: 123456,
  };
  const draw = (currency: "USD" | "CAD" = "USD") => {
    const onOverwrite = vi.fn();
    const onCancel = vi.fn();
    const props = { invoice, currency, onOverwrite, onCancel };
    return { onOverwrite, onCancel, props, tree: expand(InvoiceNumberExistsDialog(props)) };
  };

  it("S6: says which number is taken, by which customer and for how much", () => {
    const html = renderToStaticMarkup(<InvoiceNumberExistsDialog {...draw().props} />);
    expect(html).toContain(
      "An invoice numbered 900000001 already exists in QuickBooks (customer Riverside High, total $1,234.56).",
    );
  });

  it("writes the total in the quote's currency", () => {
    const html = renderToStaticMarkup(<InvoiceNumberExistsDialog {...draw("CAD").props} />);
    expect(html).toContain("total C$1,234.56");
  });

  it("S6: 'Overwrite with this quote's data' asks to overwrite", () => {
    const { tree, onOverwrite, onCancel } = draw();
    press(tree, "Overwrite with this quote's data");
    expect(onOverwrite).toHaveBeenCalledTimes(1);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("Cancel and clicking outside both cancel, and overwrite nothing", () => {
    const { tree, onOverwrite, onCancel } = draw();
    press(tree, "Cancel");
    expect(onCancel).toHaveBeenCalledTimes(1);

    captured.onOpenChange?.(false);

    expect(onCancel).toHaveBeenCalledTimes(2);
    expect(onOverwrite).not.toHaveBeenCalled();
  });
});

describe("InvoiceNotFoundDialog", () => {
  const draw = () => {
    const onYes = vi.fn();
    const onNo = vi.fn();
    const onCancel = vi.fn();
    const props = { onYes, onNo, onCancel };
    return { onYes, onNo, onCancel, props, tree: expand(InvoiceNotFoundDialog(props)) };
  };

  it("S8: says the linked invoice was not found and offers a new one", () => {
    const html = renderToStaticMarkup(<InvoiceNotFoundDialog {...draw().props} />);
    expect(html).toContain(
      "The invoice linked to this quote was not found in QuickBooks. Create a new one?",
    );
  });

  it("S8: Yes and No are different answers, and neither is a Cancel", () => {
    const { tree, onYes, onNo, onCancel } = draw();

    press(tree, "Yes");
    expect([onYes.mock.calls.length, onNo.mock.calls.length]).toEqual([1, 0]);

    press(tree, "No");
    expect([onYes.mock.calls.length, onNo.mock.calls.length]).toEqual([1, 1]);
    expect(onCancel).not.toHaveBeenCalled();
  });

  it("closing it by clicking outside is Cancel, not No", () => {
    const { onYes, onNo, onCancel } = draw();

    captured.onOpenChange?.(false);

    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onYes).not.toHaveBeenCalled();
    expect(onNo).not.toHaveBeenCalled();
  });
});

// --- the buttons ---------------------------------------------------------------------------------

/** The attribute, not the word: the button's classes carry a `disabled:` variant of their own. */
const isDisabled = (html: string) => / disabled=""/.test(html);

describe("InvoiceButtonsView", () => {
  const view = (over: Partial<Parameters<typeof InvoiceButtonsView>[0]> = {}, onPress = vi.fn()) =>
    renderToStaticMarkup(
      <InvoiceButtonsView
        eventId="evt-1"
        hasInvoice={false}
        canCreate={false}
        busy={null}
        checking={false}
        onPress={onPress}
        onCheck={vi.fn()}
        {...over}
      />,
    );

  it("S1: no invoice and a booked quote: Create invoice", () => {
    const html = view({ canCreate: true });
    expect(html).toContain("Create invoice");
    expect(html).not.toContain("Update invoice");
    expect(isDisabled(html)).toBe(false);
  });

  it("S2: no invoice and not booked: nothing is drawn", () => {
    expect(view({ canCreate: false })).toBe("");
  });

  it("S7: an invoice: Update invoice, whether or not the quote could be created", () => {
    for (const canCreate of [true, false]) {
      const html = view({ hasInvoice: true, canCreate });
      expect(html).toContain("Update invoice");
      expect(html).not.toContain("Create invoice");
    }
  });

  it("while a create is open the button says 'Creating…' and cannot be pressed", () => {
    const html = view({ canCreate: true, busy: "create" });
    expect(html).toContain("Creating…");
    expect(isDisabled(html)).toBe(true);
  });

  it("while an update is open the button says 'Updating…' and cannot be pressed", () => {
    const html = view({ hasInvoice: true, busy: "update" });
    expect(html).toContain("Updating…");
    expect(isDisabled(html)).toBe(true);
  });

  it("keeps the busy label even if the answer has already flipped the state under it", () => {
    const html = view({ hasInvoice: true, canCreate: false, busy: "create" });
    expect(html).toContain("Creating…");
    expect(html).not.toContain("Update invoice");
  });

  it("pressing Create asks for a create, and pressing Update asks for an update", () => {
    const onPress = vi.fn();
    const props = { eventId: "evt-1", busy: null, checking: false, onPress, onCheck: vi.fn() };
    press(
      expand(InvoiceButtonsView({ ...props, hasInvoice: false, canCreate: true })),
      "Create invoice",
    );
    expect(onPress).toHaveBeenLastCalledWith("create");

    press(
      expand(InvoiceButtonsView({ ...props, hasInvoice: true, canCreate: false })),
      "Update invoice",
    );
    expect(onPress).toHaveBeenLastCalledWith("update");
    expect(onPress).toHaveBeenCalledTimes(2);
  });

  describe("View in QuickBooks and Check again (spec 08 §4)", () => {
    /** The opening tag of the link, so that its attributes can be read. */
    const linkTag = (html: string) => html.match(/<a\b[^>]*>/)?.[0] ?? "";

    it("S1: a quote with an invoice draws both, beside Update invoice", () => {
      const html = view({ hasInvoice: true });
      expect(html).toContain("Update invoice");
      expect(html).toContain("View in QuickBooks");
      expect(html).toContain("Check again");
    });

    it("S2: a quote with no invoice draws neither, whether or not it can be created", () => {
      for (const canCreate of [true, false]) {
        const html = view({ hasInvoice: false, canCreate });
        expect(html).not.toContain("View in QuickBooks");
        expect(html).not.toContain("Check again");
      }
    });

    it("S3: a quote that is not booked but has an invoice draws both", () => {
      const html = view({ hasInvoice: true, canCreate: false });
      expect(html).toContain("View in QuickBooks");
      expect(html).toContain("Check again");
    });

    it("S4: View in QuickBooks is a link to the view route for this event, opened in a new tab", () => {
      const tag = linkTag(view({ hasInvoice: true, eventId: "evt-1" }));

      expect(tag).toContain('href="/api/quickbooks/invoice/view?eventId=evt-1"');
      expect(tag).toContain('target="_blank"');
    });

    it("S4: the new tab is given no access to this one (noopener)", () => {
      expect(linkTag(view({ hasInvoice: true }))).toMatch(/rel="[^"]*\bnoopener\b[^"]*"/);
    });

    it("View in QuickBooks is an ordinary link, not a button with a script behind it", () => {
      const tree = expand(
        InvoiceButtonsView({
          eventId: "evt-1",
          hasInvoice: true,
          canCreate: false,
          busy: null,
          checking: false,
          onPress: vi.fn(),
          onCheck: vi.fn(),
        }),
      );
      expect(
        buttons(tree).filter((b) => textOf(b.props.children) === "View in QuickBooks"),
      ).toHaveLength(0);
    });

    it("pressing Check again asks for a check, and does not ask for a create or an update", () => {
      const onPress = vi.fn();
      const onCheck = vi.fn();
      press(
        expand(
          InvoiceButtonsView({
            eventId: "evt-1",
            hasInvoice: true,
            canCreate: false,
            busy: null,
            checking: false,
            onPress,
            onCheck,
          }),
        ),
        "Check again",
      );

      expect(onCheck).toHaveBeenCalledTimes(1);
      expect(onPress).not.toHaveBeenCalled();
    });

    it("while a check is open the button is busy and cannot be pressed again", () => {
      const html = view({ hasInvoice: true, checking: true });

      expect(html).toContain("Checking…");
      expect(html).not.toContain("Check again");
      // Update invoice is not disabled by a check: only the busy button is.
      expect(html.match(/ disabled=""/g)).toHaveLength(1);
      expect(html).toContain("View in QuickBooks");
    });

    it("while a create or update is open, the other buttons stay as they were", () => {
      const html = view({ hasInvoice: true, busy: "update" });

      expect(html).toContain("Updating…");
      expect(html).toContain("View in QuickBooks");
      expect(html).toContain("Check again");
      expect(html.match(/ disabled=""/g)).toHaveLength(1);
    });

    it("a create that is open on a quote with no invoice yet draws neither", () => {
      const html = view({ hasInvoice: false, canCreate: true, busy: "create" });
      expect(html).toContain("Creating…");
      expect(html).not.toContain("View in QuickBooks");
      expect(html).not.toContain("Check again");
    });
  });
});

describe("InvoiceButtons", () => {
  const draw = (state: { hasInvoice: boolean; canCreate: boolean }) => {
    mocks.invoiceState.mockReturnValue({ ...state, rememberInvoice: vi.fn() });
    return renderToStaticMarkup(<InvoiceButtons eventId="evt-1" currency="CAD" />);
  };

  it("draws Create invoice for a booked quote with no invoice, and no window", () => {
    const html = draw({ hasInvoice: false, canCreate: true });
    expect(html).toContain("Create invoice");
    expect(html).not.toContain("alertdialog");
  });

  it("draws Update invoice for a quote with an invoice", () => {
    expect(draw({ hasInvoice: true, canCreate: false })).toContain("Update invoice");
  });

  it("draws nothing for a quote that is not booked and has no invoice", () => {
    expect(draw({ hasInvoice: false, canCreate: false })).toBe("");
  });

  it("S1: draws View in QuickBooks and Check again for a quote with an invoice", () => {
    const html = draw({ hasInvoice: true, canCreate: false });
    expect(html).toContain("View in QuickBooks");
    expect(html).toContain("Check again");
    expect(html).toContain('href="/api/quickbooks/invoice/view?eventId=evt-1"');
  });

  it("S2: draws neither for a booked quote with no invoice", () => {
    const html = draw({ hasInvoice: false, canCreate: true });
    expect(html).not.toContain("View in QuickBooks");
    expect(html).not.toContain("Check again");
  });

  it("S7: draws the check time under the buttons when the quote has an invoice, and not otherwise", () => {
    const withInvoice = draw({ hasInvoice: true, canCreate: false });
    expect(withInvoice).toContain("check time of evt-1");
    expect(withInvoice.indexOf("Check again")).toBeLessThan(withInvoice.indexOf("check time of"));

    expect(draw({ hasInvoice: false, canCreate: true })).not.toContain("check time of");
    expect(draw({ hasInvoice: false, canCreate: false })).not.toContain("check time of");
  });
});

describe("InvoiceDialogs", () => {
  const flow = () => ({
    press: vi.fn(),
    confirmUpdate: vi.fn(),
    chooseCustomer: vi.fn(),
    overwrite: vi.fn(),
    replaceMissing: vi.fn(),
    declineMissing: vi.fn(),
    cancel: vi.fn(),
  });
  const request = { eventId: "evt-1" };
  const invoice = {
    id: "inv-77",
    number: "900000001",
    customerName: "Riverside High",
    totalCents: 123456,
  };

  const draw = (dialog: InvoiceDialog | null) => {
    const f = flow();
    const element = InvoiceDialogs({ dialog, currency: "CAD", flow: f });
    return { f, element, tree: expand(element) };
  };

  it("draws no window when there is none", () => {
    expect(draw(null).element).toBeNull();
  });

  it("S7: the update question names what Update does to a hand-made change", () => {
    const html = renderToStaticMarkup(<>{draw({ kind: "confirm_update" }).element}</>);
    expect(html).toContain("Update the QuickBooks invoice?");
    expect(html).toContain(
      "This replaces its content with this quote&#x27;s current data, including any change made by hand in QuickBooks.",
    );
    expect(html).toContain('data-destructive="false"');
  });

  it("S7: Update invoice on the question confirms; Cancel cancels and confirms nothing", () => {
    const { f, tree } = draw({ kind: "confirm_update" });

    press(tree, "Cancel");
    expect(f.cancel).toHaveBeenCalledTimes(1);
    expect(f.confirmUpdate).not.toHaveBeenCalled();

    press(tree, "Update invoice");
    expect(f.confirmUpdate).toHaveBeenCalledTimes(1);
  });

  it("S5: the customer window answers through the flow with the dialog it came from", () => {
    const dialog: InvoiceDialog = {
      kind: "choose_customer",
      action: "create",
      request,
      candidates: CANDIDATES,
    };
    const { f, tree } = draw(dialog);

    press(tree, "Use this customer", 0);
    expect(f.chooseCustomer).toHaveBeenCalledWith(dialog, { kind: "existing", customerId: "C1" });

    press(tree, "Create a new customer");
    expect(f.chooseCustomer).toHaveBeenLastCalledWith(dialog, { kind: "new" });

    press(tree, "Cancel");
    expect(f.cancel).toHaveBeenCalledTimes(1);
  });

  it("S6: the number window shows the invoice in the quote's currency, and overwrites through the flow", () => {
    const dialog: InvoiceDialog = { kind: "number_exists", action: "create", request, invoice };
    const { f, tree, element } = draw(dialog);
    expect(renderToStaticMarkup(<>{element}</>)).toContain("total C$1,234.56");

    press(tree, "Overwrite with this quote's data");

    expect(f.overwrite).toHaveBeenCalledWith(dialog);
    expect(f.cancel).not.toHaveBeenCalled();
  });

  it("S8: the not-found window: Yes replaces, No declines, closing cancels", () => {
    const dialog: InvoiceDialog = { kind: "not_found", action: "update", request };
    const { f, tree } = draw(dialog);

    press(tree, "Yes");
    expect(f.replaceMissing).toHaveBeenCalledWith(dialog);

    press(tree, "No");
    expect(f.declineMissing).toHaveBeenCalledTimes(1);

    captured.onOpenChange?.(false);
    expect(f.cancel).toHaveBeenCalledTimes(1);
  });
});
