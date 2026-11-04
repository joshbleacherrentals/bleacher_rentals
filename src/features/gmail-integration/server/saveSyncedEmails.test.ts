import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type {
  EmailMessageRow,
  LinkRow,
} from "@/features/companiesContacts/logic/planContactEmailSave";
import type { BlockedCheck } from "./blockedEmails";
import type { ContactEmail } from "./contactEmails";
import {
  outsideAddresses,
  saveSyncedEmails,
  type EmailStore,
  type KnownCopy,
} from "./saveSyncedEmails";

const MAILBOX = "paul@bleacherrentals.com";

const email = (over: Partial<ContactEmail> & { id: string }): ContactEmail => ({
  threadId: `t-${over.id}`,
  messageId: `<${over.id}@x>`,
  inReplyTo: null,
  references: null,
  from: "Pat Smith <pat@xyz.com>",
  to: "Paul <paul@bleacherrentals.com>",
  cc: null,
  subject: "Quote",
  date: "Mon, 26 Oct 2026 10:00:00 -0600",
  snippet: "Hello",
  internalDate: 1761494400000,
  labelIds: ["INBOX"],
  direction: "received",
  copies: [{ mailbox: MAILBOX, id: over.id, threadId: `t-${over.id}` }],
  ...over,
});

// An in-memory stand-in for the database, recording what is looked up and what is written.
function fakeStore(
  data: {
    contacts?: { id: string; email: string }[];
    copies?: KnownCopy[];
    links?: { contact: string; email: string }[];
  } = {},
) {
  const emails: EmailMessageRow[] = [];
  const links: LinkRow[] = [];
  const contactLookups: string[][] = [];

  const store: EmailStore = {
    async findContacts(addresses) {
      contactLookups.push(addresses);
      // Like the real lookup, case-insensitive and willing to over-fetch.
      return (data.contacts ?? []).filter((c) =>
        addresses.some((a) => c.email.toLowerCase().replace(/_/g, "?") === a.replace(/_/g, "?")),
      );
    },
    async findCopies({ mailbox, googleIds, messageIds }) {
      return (data.copies ?? []).filter(
        (copy) =>
          (copy.google_message_id && messageIds.includes(copy.google_message_id)) ||
          (copy.mailbox === mailbox && googleIds.includes(copy.google_id)),
      );
    },
    async findLinkedIds(contactUuid, emailIds) {
      return new Set(
        (data.links ?? [])
          .filter((l) => l.contact === contactUuid && emailIds.includes(l.email))
          .map((l) => l.email),
      );
    },
    async insertEmails(rows) {
      emails.push(...rows);
    },
    async insertLinks(rows) {
      links.push(...rows);
    },
  };
  return { store, emails, links, contactLookups };
}

let counter = 0;
const base = () => ({
  mailbox: MAILBOX,
  now: "2026-10-29T12:00:00.000Z",
  newId: () => `id-${++counter}`,
  isBlocked: async (): Promise<BlockedCheck> => ({ status: "allowed" }),
});

beforeEach(() => {
  counter = 0;
});

describe("outsideAddresses", () => {
  it("lists the From, To and Cc addresses once each, in lower case", () => {
    expect(
      outsideAddresses({
        from: "Pat <Pat@XYZ.com>",
        to: "Alex <alex@xyz.com>, pat@xyz.com",
        cc: "sam@xyz.com",
      }),
    ).toEqual(["pat@xyz.com", "alex@xyz.com", "sam@xyz.com"]);
  });

  it("leaves out company addresses, subdomains of them, and anything that is not a plain address", () => {
    expect(
      outsideAddresses({
        from: "Paul <paul@bleacherrentals.com>",
        to: "x@mail.bleacherrentals.com, undisclosed-recipients, <>, 'odd name'@xyz.com, ok@xyz.com",
        cc: null,
      }),
    ).toEqual(["ok@xyz.com"]);
  });

  it("is empty for an email with no headers", () => {
    expect(outsideAddresses({ from: null, to: null, cc: null })).toEqual([]);
  });
});

describe("saveSyncedEmails", () => {
  it("saves an email for the contact it involves: the email, and a link to the contact", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
    });

    const result = await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(result).toEqual({ matched: 1, emailsAdded: 1, linksAdded: 1 });
    expect(emails).toHaveLength(1);
    expect(emails[0]).toMatchObject({
      mailbox: MAILBOX,
      google_id: "g1",
      google_thread_id: "t-g1",
      google_message_id: "<g1@x>",
      subject: "Quote",
      direction: "received",
      from_address: "Pat Smith <pat@xyz.com>",
    });
    expect(links).toEqual([
      expect.objectContaining({ contact_uuid: "c-pat", email_message_uuid: emails[0].id }),
    ]);
  });

  it("saves nothing for an email that involves no contact", async () => {
    const { store, emails, links } = fakeStore({ contacts: [] });

    const result = await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(result).toEqual({ matched: 0, emailsAdded: 0, linksAdded: 0 });
    expect(emails).toEqual([]);
    expect(links).toEqual([]);
  });

  it("finds a contact whatever the case of its address, and only an exact match", async () => {
    const { store, emails } = fakeStore({
      contacts: [
        { id: "c-pat", email: "Pat@XYZ.com" },
        { id: "c-other", email: "pat@xyz.com.au" },
      ],
    });

    await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(emails).toHaveLength(1);
  });

  it("does not even look up company addresses", async () => {
    const { store, contactLookups } = fakeStore();

    await saveSyncedEmails({
      ...base(),
      store,
      emails: [
        email({
          id: "g1",
          from: "Mike <mike@bleacherrentals.com>",
          to: "Paul <paul@bleacherrentals.com>",
        }),
      ],
    });

    expect(contactLookups).toEqual([]);
  });

  it("saves nothing for a contact whose address is blocked, as the pull does", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
    });

    const result = await saveSyncedEmails({
      ...base(),
      store,
      emails: [email({ id: "g1" })],
      isBlocked: async () => ({ status: "blocked", reason: "listed" }),
    });

    expect(result.matched).toBe(0);
    expect(emails).toEqual([]);
    expect(links).toEqual([]);
  });

  it("still saves for another contact on the same email when only one is blocked", async () => {
    const { store, links } = fakeStore({
      contacts: [
        { id: "c-pat", email: "pat@xyz.com" },
        { id: "c-sam", email: "sam@xyz.com" },
      ],
    });

    await saveSyncedEmails({
      ...base(),
      store,
      emails: [email({ id: "g1", cc: "sam@xyz.com" })],
      isBlocked: async (address) =>
        address === "pat@xyz.com" ? { status: "blocked", reason: "listed" } : { status: "allowed" },
    });

    expect(links.map((l) => l.contact_uuid)).toEqual(["c-sam"]);
  });

  it("throws, and saves nothing, when the Blocked Emails list cannot be read", async () => {
    const { store, emails } = fakeStore({ contacts: [{ id: "c-pat", email: "pat@xyz.com" }] });

    await expect(
      saveSyncedEmails({
        ...base(),
        store,
        emails: [email({ id: "g1" })],
        isBlocked: async () => ({ status: "unreadable", message: "connection lost" }),
      }),
    ).rejects.toThrow(/Blocked Emails list/);
    expect(emails).toEqual([]);
  });

  it("saves one row, and a link for each contact, when an email involves two contacts", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [
        { id: "c-pat", email: "pat@xyz.com" },
        { id: "c-sam", email: "sam@xyz.com" },
      ],
    });

    const result = await saveSyncedEmails({
      ...base(),
      store,
      emails: [email({ id: "g1", cc: "sam@xyz.com" })],
    });

    expect(result).toEqual({ matched: 1, emailsAdded: 1, linksAdded: 2 });
    expect(emails).toHaveLength(1);
    expect(links.map((l) => l.contact_uuid).sort()).toEqual(["c-pat", "c-sam"]);
    expect(links.every((l) => l.email_message_uuid === emails[0].id)).toBe(true);
  });

  it("links both contacts when two contacts share an address", async () => {
    const { store, links } = fakeStore({
      contacts: [
        { id: "c-1", email: "pat@xyz.com" },
        { id: "c-2", email: "pat@xyz.com" },
      ],
    });

    await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(links.map((l) => l.contact_uuid).sort()).toEqual(["c-1", "c-2"]);
  });

  it("saves nothing twice: a copy already saved is not saved again, and a contact already linked is not linked again", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
      copies: [
        {
          id: "row-1",
          mailbox: MAILBOX,
          google_id: "g1",
          google_thread_id: "t-g1",
          google_message_id: "<g1@x>",
        },
      ],
      links: [{ contact: "c-pat", email: "row-1" }],
    });

    const result = await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(result).toEqual({ matched: 1, emailsAdded: 0, linksAdded: 0 });
    expect(emails).toEqual([]);
    expect(links).toEqual([]);
  });

  it("links a contact to a copy that was saved without a link", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
      copies: [
        {
          id: "row-1",
          mailbox: MAILBOX,
          google_id: "g1",
          google_thread_id: "t-g1",
          google_message_id: "<g1@x>",
        },
      ],
    });

    await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(emails).toEqual([]);
    expect(links).toEqual([
      expect.objectContaining({ contact_uuid: "c-pat", email_message_uuid: "row-1" }),
    ]);
  });

  it("saves this mailbox's copy of an email another mailbox already saved, without linking the contact a second time", async () => {
    const { store, emails, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
      copies: [
        {
          id: "row-mike",
          mailbox: "mike@bleacherrentals.com",
          google_id: "m9",
          google_thread_id: "t-m9",
          google_message_id: "<g1@x>",
        },
      ],
      links: [{ contact: "c-pat", email: "row-mike" }],
    });

    const result = await saveSyncedEmails({ ...base(), store, emails: [email({ id: "g1" })] });

    expect(result).toEqual({ matched: 1, emailsAdded: 1, linksAdded: 0 });
    expect(emails).toEqual([expect.objectContaining({ mailbox: MAILBOX, google_id: "g1" })]);
    expect(links).toEqual([]);
  });

  it("matches an email in two mailboxes by its Message-ID whatever the case", async () => {
    const { store, links } = fakeStore({
      contacts: [{ id: "c-pat", email: "pat@xyz.com" }],
      copies: [
        {
          id: "row-mike",
          mailbox: "mike@bleacherrentals.com",
          google_id: "m9",
          google_thread_id: "t-m9",
          google_message_id: "<G1@X>",
        },
      ],
      links: [{ contact: "c-pat", email: "row-mike" }],
    });

    await saveSyncedEmails({
      ...base(),
      store,
      emails: [email({ id: "g1", messageId: "<G1@X>" })],
    });

    expect(links).toEqual([]);
  });

  it("saves several emails in one go, in order, emails before links", async () => {
    const order: string[] = [];
    const { store } = fakeStore({ contacts: [{ id: "c-pat", email: "pat@xyz.com" }] });
    const spy: EmailStore = {
      ...store,
      insertEmails: async (rows) => {
        order.push(`emails:${rows.length}`);
        await store.insertEmails(rows);
      },
      insertLinks: async (rows) => {
        order.push(`links:${rows.length}`);
        await store.insertLinks(rows);
      },
    };

    const result = await saveSyncedEmails({
      ...base(),
      store: spy,
      emails: [email({ id: "g1" }), email({ id: "g2" }), email({ id: "g3", from: "x@other.com" })],
    });

    expect(result).toEqual({ matched: 2, emailsAdded: 2, linksAdded: 2 });
    expect(order).toEqual(["emails:2", "links:2"]);
  });

  it("does nothing for no emails", async () => {
    const { store, contactLookups } = fakeStore();

    expect(await saveSyncedEmails({ ...base(), store, emails: [] })).toEqual({
      matched: 0,
      emailsAdded: 0,
      linksAdded: 0,
    });
    expect(contactLookups).toEqual([]);
  });
});
