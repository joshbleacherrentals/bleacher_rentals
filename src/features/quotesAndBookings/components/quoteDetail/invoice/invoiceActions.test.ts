import { afterEach, describe, expect, it, vi } from "vitest";
import {
  checkOutcome,
  createInvoiceFlow,
  NETWORK_ERROR_MESSAGE,
  NOT_FOUND_DECLINED_MESSAGE,
  postCheck,
  postInvoice,
  runCheckAgain,
  warningMessage,
  type CheckFlowIo,
  type CheckResult,
  type InvoiceDialog,
  type InvoiceFlowIo,
  type InvoiceRequest,
  type InvoiceResult,
} from "./invoiceActions";

// Spec: docs/specs/qbo-invoice-07-card-buttons.md §4 (the flows) and §9 (edge cases). The screen has
// no DOM here, so what it decides lives in createInvoiceFlow, which takes everything it touches as
// a fake: the route, the windows, the busy flag, the toasts and the remembered answer.

const EVENT_ID = "11111111-1111-4111-8111-111111111111";
const INVOICE = {
  id: "inv-77",
  number: "900000001",
  customerName: "Riverside High",
  totalCents: 123456,
};
const CANDIDATES = [
  { id: "C1", displayName: "Dana Whitfield", companyName: "Riverside High", email: "dana@r.edu" },
  { id: "C2", displayName: "Dana Whitfield", companyName: null, email: null },
];

const created = (
  over: Partial<Extract<InvoiceResult, { status: "created" }>> = {},
): InvoiceResult => ({
  status: "created",
  docNumber: "900000001",
  qboInvoiceId: "inv-77",
  warnings: [],
  ...over,
});

const updated = (
  over: Partial<Extract<InvoiceResult, { status: "updated" }>> = {},
): InvoiceResult => ({
  status: "updated",
  docNumber: "900000001",
  qboInvoiceId: "inv-77",
  linkedExisting: false,
  warnings: [],
  ...over,
});

/** The flow with fakes; `answers` are what the route says to each request, in order. */
function harness(answers: Array<InvoiceResult | Error> = []) {
  const posted: InvoiceRequest[] = [];
  const log: string[] = [];
  const state = { dialog: null as InvoiceDialog | null };
  const io: InvoiceFlowIo = {
    post: vi.fn(async (request: InvoiceRequest) => {
      posted.push(request);
      log.push("post");
      const answer = answers.shift();
      if (!answer) throw new Error("the fake route has no answer left");
      if (answer instanceof Error) throw answer;
      return answer;
    }),
    setDialog: vi.fn((dialog: InvoiceDialog | null) => {
      state.dialog = dialog;
      log.push(`dialog:${dialog?.kind ?? "closed"}`);
    }),
    setBusy: vi.fn((busy) => log.push(`busy:${busy ?? "off"}`)),
    remember: vi.fn(),
    success: vi.fn(),
    warn: vi.fn(),
    fail: vi.fn(),
  };
  return { io, posted, log, state, flow: createInvoiceFlow(EVENT_ID, io) };
}

describe("postInvoice", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs the request as JSON to the invoice route and returns the answer", async () => {
    const answer = created();
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const request: InvoiceRequest = {
      eventId: EVENT_ID,
      customerChoice: { kind: "new" },
      replaceMissing: true,
      overwriteInvoiceId: "inv-77",
    };
    await expect(postInvoice(request)).resolves.toEqual(answer);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/quickbooks/invoice");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual(request);
  });

  it("returns a window answer as an answer, not as an error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(
        async () => new Response(JSON.stringify({ status: "invoice_missing" }), { status: 200 }),
      ),
    );
    await expect(postInvoice({ eventId: EVENT_ID })).resolves.toEqual({
      status: "invoice_missing",
    });
  });

  it.each([400, 401, 403, 404, 409, 502])(
    "turns an HTTP %i into an exception carrying the route's message",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () => new Response(JSON.stringify({ error: "Forbidden by the route" }), { status }),
        ),
      );
      await expect(postInvoice({ eventId: EVENT_ID })).rejects.toThrow("Forbidden by the route");
    },
  );

  it("still throws, naming the status, when the error answer is not the route's JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Gateway Timeout</html>", { status: 504 })),
    );
    await expect(postInvoice({ eventId: EVENT_ID })).rejects.toThrow(/504/);
  });

  it("turns a network failure into the 'Could not reach the server' message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Promise.reject(new TypeError("Failed to fetch"))),
    );
    await expect(postInvoice({ eventId: EVENT_ID })).rejects.toThrow(
      "Could not reach the server. Check your connection and try again.",
    );
    expect(NETWORK_ERROR_MESSAGE).toBe(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});

describe("warningMessage", () => {
  it("pdf_not_attached", () => {
    expect(
      warningMessage({ code: "pdf_not_attached", reason: "QuickBooks refused the file" }),
    ).toBe(
      "The PDF was not attached (QuickBooks refused the file). Press Update invoice to try again.",
    );
  });

  it("invoice_check_failed", () => {
    expect(warningMessage({ code: "invoice_check_failed", reason: "timed out" })).toBe(
      "The invoice could not be checked against the quote.",
    );
  });

  it("class_missing", () => {
    expect(warningMessage({ code: "class_missing", state: "SC", reason: "no_zone" })).toBe(
      "No QuickBooks Class was found for SC. The invoice was made without one; set the Class in QuickBooks.",
    );
  });

  it("tax_code_missing", () => {
    expect(warningMessage({ code: "tax_code_missing", province: "ON" })).toBe(
      "No QuickBooks tax code is mapped for ON. The invoice was made without tax; map the code on the QuickBooks page, then press Update invoice.",
    );
  });
});

describe("Create flow", () => {
  it("S1: sends only the event id, shows the busy state while the request is open, and remembers the answer", async () => {
    const { flow, io, posted, log } = harness([created()]);

    await flow.press("create");

    expect(posted).toEqual([{ eventId: EVENT_ID }]);
    expect(log).toEqual(["busy:create", "post", "busy:off"]);
    expect(io.success).toHaveBeenCalledWith("Invoice 900000001 created in QuickBooks");
    expect(io.remember).toHaveBeenCalledWith("900000001");
    expect(io.warn).not.toHaveBeenCalled();
    expect(io.fail).not.toHaveBeenCalled();
  });

  it("opens no window and asks nothing before it sends", async () => {
    const { flow, io } = harness([created()]);
    await flow.press("create");
    expect(io.setDialog).not.toHaveBeenCalled();
  });

  it("S9: shows each warning as its own toast, after the success toast", async () => {
    const { flow, io } = harness([
      created({
        warnings: [
          { code: "pdf_not_attached", reason: "disk full" },
          { code: "invoice_check_failed", reason: "timed out" },
          { code: "class_missing", state: "SC", reason: "no_class" },
          { code: "tax_code_missing", province: "ON" },
        ],
      }),
    ]);

    await flow.press("create");

    expect(io.success).toHaveBeenCalledTimes(1);
    expect(vi.mocked(io.warn).mock.calls.map(([line]) => line)).toEqual([
      "The PDF was not attached (disk full). Press Update invoice to try again.",
      "The invoice could not be checked against the quote.",
      "No QuickBooks Class was found for SC. The invoice was made without one; set the Class in QuickBooks.",
      "No QuickBooks tax code is mapped for ON. The invoice was made without tax; map the code on the QuickBooks page, then press Update invoice.",
    ]);
  });

  it("S5: choose_customer opens the customer window with the candidates, and sends nothing yet", async () => {
    const { flow, io, posted, state } = harness([
      { status: "choose_customer", candidates: CANDIDATES },
    ]);

    await flow.press("create");

    expect(state.dialog).toEqual({
      kind: "choose_customer",
      action: "create",
      request: { eventId: EVENT_ID },
      candidates: CANDIDATES,
    });
    expect(posted).toHaveLength(1);
    expect(io.success).not.toHaveBeenCalled();
    expect(io.remember).not.toHaveBeenCalled();
  });

  it("S5: 'Use this customer' sends the same request again with customerChoice, and closes the window first", async () => {
    const { flow, posted, state, log } = harness([
      { status: "choose_customer", candidates: CANDIDATES },
      created(),
    ]);
    await flow.press("create");
    const dialog = state.dialog as Extract<InvoiceDialog, { kind: "choose_customer" }>;

    await flow.chooseCustomer(dialog, { kind: "existing", customerId: "C2" });

    expect(posted[1]).toEqual({
      eventId: EVENT_ID,
      customerChoice: { kind: "existing", customerId: "C2" },
    });
    expect(state.dialog).toBeNull();
    expect(log.indexOf("dialog:closed")).toBeLessThan(log.lastIndexOf("post"));
  });

  it("S5: 'Create a new customer' sends { kind: 'new' }", async () => {
    const { flow, posted, state } = harness([
      { status: "choose_customer", candidates: CANDIDATES },
      created(),
    ]);
    await flow.press("create");

    await flow.chooseCustomer(state.dialog as Extract<InvoiceDialog, { kind: "choose_customer" }>, {
      kind: "new",
    });

    expect(posted[1]).toEqual({ eventId: EVENT_ID, customerChoice: { kind: "new" } });
  });

  it("S6: invoice_number_exists opens the number window with the invoice, and sends nothing yet", async () => {
    const { flow, posted, state } = harness([
      { status: "invoice_number_exists", invoice: INVOICE },
    ]);

    await flow.press("create");

    expect(state.dialog).toEqual({
      kind: "number_exists",
      action: "create",
      request: { eventId: EVENT_ID },
      invoice: INVOICE,
    });
    expect(posted).toHaveLength(1);
  });

  it("S6: Overwrite sends the same request again with overwriteInvoiceId", async () => {
    const { flow, posted, state, io } = harness([
      { status: "invoice_number_exists", invoice: INVOICE },
      updated({ linkedExisting: true }),
    ]);
    await flow.press("create");

    await flow.overwrite(state.dialog as Extract<InvoiceDialog, { kind: "number_exists" }>);

    expect(posted[1]).toEqual({ eventId: EVENT_ID, overwriteInvoiceId: "inv-77" });
    expect(state.dialog).toBeNull();
    expect(io.success).toHaveBeenCalledWith("Invoice 900000001 updated");
    expect(io.remember).toHaveBeenCalledWith("900000001");
  });

  it("keeps the customer already chosen when the number window follows, and the other way round", async () => {
    const { flow, posted, state } = harness([
      { status: "invoice_number_exists", invoice: INVOICE },
      { status: "choose_customer", candidates: CANDIDATES },
      updated({ linkedExisting: true }),
    ]);
    await flow.press("create");
    await flow.overwrite(state.dialog as Extract<InvoiceDialog, { kind: "number_exists" }>);
    await flow.chooseCustomer(state.dialog as Extract<InvoiceDialog, { kind: "choose_customer" }>, {
      kind: "new",
    });

    expect(posted[2]).toEqual({
      eventId: EVENT_ID,
      overwriteInvoiceId: "inv-77",
      customerChoice: { kind: "new" },
    });
  });

  it("the busy label stays 'create' for the re-sends that follow a window", async () => {
    const { flow, state, log } = harness([
      { status: "choose_customer", candidates: CANDIDATES },
      created(),
    ]);
    await flow.press("create");
    await flow.chooseCustomer(state.dialog as Extract<InvoiceDialog, { kind: "choose_customer" }>, {
      kind: "new",
    });

    expect(log.filter((entry) => entry.startsWith("busy:"))).toEqual([
      "busy:create",
      "busy:off",
      "busy:create",
      "busy:off",
    ]);
  });

  it("S6/S5: Cancel closes the window and sends nothing", async () => {
    const { flow, posted, state, io } = harness([
      { status: "invoice_number_exists", invoice: INVOICE },
    ]);
    await flow.press("create");

    flow.cancel();

    expect(state.dialog).toBeNull();
    expect(posted).toHaveLength(1);
    expect(io.success).not.toHaveBeenCalled();
    expect(io.fail).not.toHaveBeenCalled();
  });

  it("S10: a route error shows its message, remembers nothing and clears the busy state", async () => {
    const { flow, io, log } = harness([new Error("Only a booked quote can get an invoice")]);

    await flow.press("create");

    expect(io.fail).toHaveBeenCalledWith("Only a booked quote can get an invoice");
    expect(io.remember).not.toHaveBeenCalled();
    expect(io.success).not.toHaveBeenCalled();
    expect(log.at(-1)).toBe("busy:off");
  });

  it("an error thrown by something that is not an Error still reaches the user", async () => {
    const { flow, io } = harness([]);
    vi.mocked(io.post).mockRejectedValueOnce("plain string");

    await flow.press("create");

    expect(io.fail).toHaveBeenCalledWith("plain string");
  });
});

describe("Update flow", () => {
  it("S7: pressing Update asks first and sends nothing", async () => {
    const { flow, posted, state, io } = harness([updated()]);

    await flow.press("update");

    expect(state.dialog).toEqual({ kind: "confirm_update" });
    expect(posted).toEqual([]);
    expect(io.setBusy).not.toHaveBeenCalled();
  });

  it("S7: asks again on every press, however often the quote was updated before", async () => {
    const { flow, state } = harness([updated(), updated()]);

    await flow.press("update");
    await flow.confirmUpdate();
    expect(state.dialog).toBeNull();
    await flow.press("update");

    expect(state.dialog).toEqual({ kind: "confirm_update" });
  });

  it("S7: Cancel on the confirmation sends nothing and shows nothing", async () => {
    const { flow, posted, state, io } = harness([updated()]);
    await flow.press("update");

    flow.cancel();

    expect(state.dialog).toBeNull();
    expect(posted).toEqual([]);
    expect(io.success).not.toHaveBeenCalled();
    expect(io.fail).not.toHaveBeenCalled();
    expect(io.remember).not.toHaveBeenCalled();
  });

  it("on confirm closes the question and sends only the event id, with the busy state on", async () => {
    const { flow, posted, log, io } = harness([updated()]);
    await flow.press("update");

    await flow.confirmUpdate();

    expect(posted).toEqual([{ eventId: EVENT_ID }]);
    expect(log).toEqual([
      "dialog:confirm_update",
      "dialog:closed",
      "busy:update",
      "post",
      "busy:off",
    ]);
    expect(io.success).toHaveBeenCalledWith("Invoice 900000001 updated");
    expect(io.remember).toHaveBeenCalledWith("900000001");
  });

  it("S9: shows the same warning toasts as Create", async () => {
    const { flow, io } = harness([
      updated({ warnings: [{ code: "class_missing", state: "SC", reason: "no_zone" }] }),
    ]);
    await flow.press("update");

    await flow.confirmUpdate();

    expect(io.warn).toHaveBeenCalledWith(
      "No QuickBooks Class was found for SC. The invoice was made without one; set the Class in QuickBooks.",
    );
  });

  it("choose_customer opens the customer window; the answer re-sends the request with customerChoice", async () => {
    const { flow, posted, state } = harness([
      { status: "choose_customer", candidates: CANDIDATES },
      updated(),
    ]);
    await flow.press("update");
    await flow.confirmUpdate();
    expect(state.dialog).toMatchObject({ kind: "choose_customer", action: "update" });

    await flow.chooseCustomer(state.dialog as Extract<InvoiceDialog, { kind: "choose_customer" }>, {
      kind: "existing",
      customerId: "C1",
    });

    expect(posted[1]).toEqual({
      eventId: EVENT_ID,
      customerChoice: { kind: "existing", customerId: "C1" },
    });
  });

  it("S8: invoice_missing opens the not-found window, and sends nothing yet", async () => {
    const { flow, state, posted } = harness([{ status: "invoice_missing" }]);
    await flow.press("update");

    await flow.confirmUpdate();

    expect(state.dialog).toEqual({
      kind: "not_found",
      action: "update",
      request: { eventId: EVENT_ID },
    });
    expect(posted).toHaveLength(1);
  });

  it("S8: Yes sends replaceMissing, and the new invoice is reported as created", async () => {
    const { flow, posted, state, io } = harness([{ status: "invoice_missing" }, created()]);
    await flow.press("update");
    await flow.confirmUpdate();

    await flow.replaceMissing(state.dialog as Extract<InvoiceDialog, { kind: "not_found" }>);

    expect(posted[1]).toEqual({ eventId: EVENT_ID, replaceMissing: true });
    expect(state.dialog).toBeNull();
    expect(io.success).toHaveBeenCalledWith("Invoice 900000001 created in QuickBooks");
    expect(io.remember).toHaveBeenCalledWith("900000001");
  });

  it("S8: No shows the developer message and sends nothing", async () => {
    const { flow, posted, state, io } = harness([{ status: "invoice_missing" }]);
    await flow.press("update");
    await flow.confirmUpdate();

    flow.declineMissing();

    expect(state.dialog).toBeNull();
    expect(posted).toHaveLength(1);
    expect(io.fail).toHaveBeenCalledWith(
      "If the invoice was not deleted in QuickBooks, this is probably a bug — please tell the developer.",
    );
    expect(NOT_FOUND_DECLINED_MESSAGE).toBe(
      "If the invoice was not deleted in QuickBooks, this is probably a bug — please tell the developer.",
    );
  });

  it("S8: closing the not-found window (Cancel) sends nothing and shows no message", async () => {
    const { flow, posted, io } = harness([{ status: "invoice_missing" }]);
    await flow.press("update");
    await flow.confirmUpdate();

    flow.cancel();

    expect(posted).toHaveLength(1);
    expect(io.fail).not.toHaveBeenCalled();
  });

  it("after Yes, a number already in QuickBooks re-sends replaceMissing with overwriteInvoiceId", async () => {
    const { flow, posted, state } = harness([
      { status: "invoice_missing" },
      { status: "invoice_number_exists", invoice: INVOICE },
      updated({ linkedExisting: true }),
    ]);
    await flow.press("update");
    await flow.confirmUpdate();
    await flow.replaceMissing(state.dialog as Extract<InvoiceDialog, { kind: "not_found" }>);
    expect(state.dialog).toMatchObject({ kind: "number_exists", action: "update" });

    await flow.overwrite(state.dialog as Extract<InvoiceDialog, { kind: "number_exists" }>);

    expect(posted[2]).toEqual({
      eventId: EVENT_ID,
      replaceMissing: true,
      overwriteInvoiceId: "inv-77",
    });
  });

  it("the busy label is 'update' for the whole of an update, windows and re-sends included", async () => {
    const { flow, state, log } = harness([{ status: "invoice_missing" }, created()]);
    await flow.press("update");
    await flow.confirmUpdate();
    await flow.replaceMissing(state.dialog as Extract<InvoiceDialog, { kind: "not_found" }>);

    expect(log.filter((entry) => entry.startsWith("busy:"))).toEqual([
      "busy:update",
      "busy:off",
      "busy:update",
      "busy:off",
    ]);
  });

  it("S10: a route error after the confirmation shows its message", async () => {
    const { flow, io } = harness([
      new Error("Could not reach the server. Check your connection and try again."),
    ]);
    await flow.press("update");

    await flow.confirmUpdate();

    expect(io.fail).toHaveBeenCalledWith(
      "Could not reach the server. Check your connection and try again.",
    );
  });
});

// --- Check again (docs/specs/qbo-invoice-08-view-and-check.md §4) ----------------------------------

const MATCHING: CheckResult = { status: "checked", matches: true, reasons: [], differences: [] };

const DIFFERING: CheckResult = {
  status: "checked",
  matches: false,
  reasons: ["dates", "amount"],
  differences: [
    { reason: "dates", field: "Due date", quote: "2026-11-14", qbo: "2026-11-01" },
    { reason: "dates", field: "Invoice date", quote: "2026-11-10", qbo: "2026-11-09" },
    { reason: "amount", field: "Amount", quote: "7500.00", qbo: "7499.99" },
  ],
};

describe("postCheck", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("POSTs { eventId } as JSON to the check route and returns the answer", async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(DIFFERING), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(postCheck(EVENT_ID)).resolves.toEqual(DIFFERING);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("/api/quickbooks/invoice/check");
    expect(init.method).toBe("POST");
    expect(init.headers).toMatchObject({ "Content-Type": "application/json" });
    expect(JSON.parse(init.body as string)).toEqual({ eventId: EVENT_ID });
  });

  it.each<CheckResult>([
    { status: "invoice_missing" },
    { status: "skipped", message: "This quote has no venue street yet." },
  ])("returns %j as an answer, not as an error", async (answer) => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify(answer), { status: 200 })),
    );

    await expect(postCheck(EVENT_ID)).resolves.toEqual(answer);
  });

  it.each([400, 401, 403, 404, 409, 502])(
    "turns an HTTP %i into an exception carrying the route's message",
    async (status) => {
      vi.stubGlobal(
        "fetch",
        vi.fn(
          async () => new Response(JSON.stringify({ error: "Refused by the route" }), { status }),
        ),
      );

      await expect(postCheck(EVENT_ID)).rejects.toThrow("Refused by the route");
    },
  );

  it("still throws, naming the status, when the error answer is not the route's JSON", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("<html>Gateway Timeout</html>", { status: 504 })),
    );

    await expect(postCheck(EVENT_ID)).rejects.toThrow("504");
  });

  it("turns a network failure into the 'Could not reach the server' message", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );

    await expect(postCheck(EVENT_ID)).rejects.toThrow(NETWORK_ERROR_MESSAGE);
  });
});

describe("checkOutcome", () => {
  it("S5: an invoice that matches is a success: 'The invoice matches the quote.'", () => {
    expect(checkOutcome(MATCHING)).toEqual({
      tone: "success",
      lines: ["The invoice matches the quote."],
    });
  });

  it("S5: a different invoice is an error with one line per difference, each starting with the reason's short text", () => {
    expect(checkOutcome(DIFFERING)).toEqual({
      tone: "error",
      lines: [
        "Dates do not match — Due date: QuickBooks 2026-11-01, quote 2026-11-14.",
        "Dates do not match — Invoice date: QuickBooks 2026-11-09, quote 2026-11-10.",
        "Amount does not match — Amount: QuickBooks 7499.99, quote 7500.00.",
      ],
    });
  });

  it("S5: invoice_missing: 'The invoice was not found in QuickBooks.'", () => {
    expect(checkOutcome({ status: "invoice_missing" })).toEqual({
      tone: "error",
      lines: ["The invoice was not found in QuickBooks."],
    });
  });

  it("S5: skipped: the route's message, as it came", () => {
    expect(
      checkOutcome({ status: "skipped", message: "The quote has no venue street yet." }),
    ).toEqual({ tone: "error", lines: ["The quote has no venue street yet."] });
  });
});

describe("runCheckAgain", () => {
  /** The flow with fakes; `answers` are what the route says to each request, in order. */
  function checkHarness(answers: Array<CheckResult | Error> = []) {
    const log: string[] = [];
    const io: CheckFlowIo = {
      post: vi.fn(async (eventId: string) => {
        log.push(`post:${eventId}`);
        const answer = answers.shift();
        if (!answer) throw new Error("the fake route has no answer left");
        if (answer instanceof Error) throw answer;
        return answer;
      }),
      setChecking: vi.fn((checking: boolean) => log.push(`checking:${checking ? "on" : "off"}`)),
      success: vi.fn(),
      fail: vi.fn(),
    };
    return { io, log };
  }

  it("sends only the event id, and the button is busy from before the request until after the toast", async () => {
    const { io, log } = checkHarness([MATCHING]);
    (io.success as ReturnType<typeof vi.fn>).mockImplementation(() => log.push("toast"));

    await runCheckAgain(EVENT_ID, io);

    expect(log).toEqual(["checking:on", `post:${EVENT_ID}`, "toast", "checking:off"]);
  });

  it("S5: an equal invoice shows the success toast and no error", async () => {
    const { io } = checkHarness([MATCHING]);

    await runCheckAgain(EVENT_ID, io);

    expect(io.success).toHaveBeenCalledWith(["The invoice matches the quote."]);
    expect(io.fail).not.toHaveBeenCalled();
  });

  it("S5: a different invoice shows the error toast naming each reason, and no success", async () => {
    const { io } = checkHarness([DIFFERING]);

    await runCheckAgain(EVENT_ID, io);

    expect(io.fail).toHaveBeenCalledTimes(1);
    expect(io.fail).toHaveBeenCalledWith([
      "Dates do not match — Due date: QuickBooks 2026-11-01, quote 2026-11-14.",
      "Dates do not match — Invoice date: QuickBooks 2026-11-09, quote 2026-11-10.",
      "Amount does not match — Amount: QuickBooks 7499.99, quote 7500.00.",
    ]);
    expect(io.success).not.toHaveBeenCalled();
  });

  it("S5: invoice_missing shows its message", async () => {
    const { io } = checkHarness([{ status: "invoice_missing" }]);

    await runCheckAgain(EVENT_ID, io);

    expect(io.fail).toHaveBeenCalledWith(["The invoice was not found in QuickBooks."]);
    expect(io.success).not.toHaveBeenCalled();
  });

  it("S5: skipped shows the route's message", async () => {
    const { io } = checkHarness([
      { status: "skipped", message: "The quote has no venue street yet." },
    ]);

    await runCheckAgain(EVENT_ID, io);

    expect(io.fail).toHaveBeenCalledWith(["The quote has no venue street yet."]);
  });

  it("S5: an error shows the route's message and clears the busy state", async () => {
    const { io, log } = checkHarness([new Error("QuickBooks could not be reached.")]);

    await runCheckAgain(EVENT_ID, io);

    expect(io.fail).toHaveBeenCalledWith(["QuickBooks could not be reached."]);
    expect(io.success).not.toHaveBeenCalled();
    expect(log.at(-1)).toBe("checking:off");
  });

  it("an error thrown by something that is not an Error still reaches the user", async () => {
    const { io } = checkHarness();
    (io.post as ReturnType<typeof vi.fn>).mockRejectedValue("boom");

    await runCheckAgain(EVENT_ID, io);

    expect(io.fail).toHaveBeenCalledWith(["boom"]);
  });
});
