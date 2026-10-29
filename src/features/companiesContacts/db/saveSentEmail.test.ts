import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  DummyDriver,
  Kysely,
  SqliteAdapter,
  SqliteIntrospector,
  SqliteQueryCompiler,
  type CompiledQuery,
} from "kysely";

const testDb = new Kysely<any>({
  dialect: {
    createAdapter: () => new SqliteAdapter(),
    createDriver: () => new DummyDriver(),
    createIntrospector: (db) => new SqliteIntrospector(db),
    createQueryCompiler: () => new SqliteQueryCompiler(),
  },
});

vi.mock("@/components/providers/SystemProvider", () => ({
  get db() {
    return testDb;
  },
}));

const calls: string[] = [];
let savedRows: { id: string; email_message_details_uuid: string | null }[];
const lookups: CompiledQuery[] = [];
vi.mock("@/lib/powersync/typedQuery", () => ({
  expect: () => undefined,
  typedGetAll: async (query: CompiledQuery) => {
    calls.push("lookup");
    lookups.push(query);
    return savedRows;
  },
}));

const saveContactEmails = vi.fn();
vi.mock("./saveContactEmails", () => ({
  saveContactEmails: async (...args: unknown[]) => {
    calls.push("saveContactEmails");
    return saveContactEmails(...args);
  },
}));

const saveEmailDetails = vi.fn();
vi.mock("./loadEmailDetails", () => ({
  saveEmailDetails: async (...args: unknown[]) => {
    calls.push("saveEmailDetails");
    return saveEmailDetails(...args);
  },
}));

import type { PulledEmail } from "../logic/emailActivity";
import { saveSentEmail } from "./saveSentEmail";

const message = {
  messageId: "<sent@co.com>",
  direction: "sent",
  copies: [{ mailbox: "josh@bleacherrentals.com", id: "sent1", threadId: "t-sent" }],
} as unknown as PulledEmail;

beforeEach(() => {
  vi.clearAllMocks();
  calls.length = 0;
  lookups.length = 0;
  savedRows = [{ id: "row-1", email_message_details_uuid: null }];
});

describe("saveSentEmail", () => {
  it("saves the email to the contact's thread, then its body onto the saved row", async () => {
    await saveSentEmail("contact-1", { message, details: { text: "Sounds good.", html: null } });

    expect(saveContactEmails).toHaveBeenCalledWith("contact-1", [message]);
    expect(saveEmailDetails).toHaveBeenCalledWith({
      emailMessageUuid: "row-1",
      bodyText: "Sounds good.",
      bodyHtml: null,
    });
    // The body points at a row, so the row has to be there first.
    expect(calls).toEqual(["saveContactEmails", "lookup", "saveEmailDetails"]);
  });

  it("finds the row by the copy's mailbox and Gmail id", async () => {
    await saveSentEmail("contact-1", { message, details: { text: "Hi", html: null } });

    expect(lookups[0].sql).toMatch(/"mailbox" = \?/);
    expect(lookups[0].sql).toMatch(/"google_id" = \?/);
    expect(lookups[0].parameters).toEqual(["josh@bleacherrentals.com", "sent1"]);
  });

  it("saves an html body too", async () => {
    await saveSentEmail("contact-1", { message, details: { text: "Hi", html: "<p>Hi</p>" } });

    expect(saveEmailDetails).toHaveBeenCalledWith({
      emailMessageUuid: "row-1",
      bodyText: "Hi",
      bodyHtml: "<p>Hi</p>",
    });
  });

  it("saves only the email when the server sent no body", async () => {
    await saveSentEmail("contact-1", { message, details: null });
    await saveSentEmail("contact-1", { message, details: { text: null, html: null } });

    expect(saveContactEmails).toHaveBeenCalledTimes(2);
    expect(saveEmailDetails).not.toHaveBeenCalled();
  });

  it("leaves a body that is already saved alone", async () => {
    savedRows = [{ id: "row-1", email_message_details_uuid: "details-1" }];

    await saveSentEmail("contact-1", { message, details: { text: "Hi", html: null } });

    expect(saveEmailDetails).not.toHaveBeenCalled();
  });

  it("saves no body when the row cannot be found", async () => {
    savedRows = [];

    await saveSentEmail("contact-1", { message, details: { text: "Hi", html: null } });

    expect(saveEmailDetails).not.toHaveBeenCalled();
  });

  it("does nothing when the server could not read the sent email back", async () => {
    await saveSentEmail("contact-1", { message: null, details: null });

    expect(calls).toEqual([]);
  });

  it("does not look for a body when saving the email failed", async () => {
    saveContactEmails.mockRejectedValueOnce(new Error("disk full"));

    await expect(
      saveSentEmail("contact-1", { message, details: { text: "Hi", html: null } }),
    ).rejects.toThrow("disk full");
    expect(saveEmailDetails).not.toHaveBeenCalled();
  });
});
