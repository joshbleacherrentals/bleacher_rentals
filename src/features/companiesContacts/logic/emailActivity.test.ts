import { describe, expect, it } from "vitest";
import {
  addressLines,
  parseAddressList,
  personNameParts,
  personWithAddress,
  pulledEmailDate,
  replyAllRecipients,
  replyRecipients,
  decodeSnippet,
  storedToActivityEmail,
  summarizeAddresses,
} from "./emailActivity";

describe("parseAddressList", () => {
  it("splits names and addresses", () => {
    expect(
      parseAddressList(
        "Ryan Verbuyst <rverbuyst@wellmaster.ca>, Paul Hogendoorn <paul@tpi-3.ca>, plain@y.com",
      ),
    ).toEqual([
      { name: "Ryan Verbuyst", address: "rverbuyst@wellmaster.ca" },
      { name: "Paul Hogendoorn", address: "paul@tpi-3.ca" },
      { name: null, address: "plain@y.com" },
    ]);
  });

  it("keeps a comma inside a quoted name", () => {
    expect(parseAddressList('"Smith, Jo" <jo@x.com>, b@y.com')).toEqual([
      { name: "Smith, Jo", address: "jo@x.com" },
      { name: null, address: "b@y.com" },
    ]);
  });

  it("returns nothing for an empty or missing header", () => {
    expect(parseAddressList(null)).toEqual([]);
    expect(parseAddressList("  ")).toEqual([]);
  });
});

describe("summarizeAddresses", () => {
  const to =
    "Ryan Verbuyst <rverbuyst@wellmaster.ca>, Paul Hogendoorn <paul@tpi-3.ca>, Ginny Hanson <ginny.hanson@wellmaster.ca>";

  it("shows the first two people and how many more", () => {
    expect(summarizeAddresses(to)).toBe("Ryan Verbuyst, Paul Hogendoorn +1");
  });

  it("shows everyone when there are few, falling back to the address when there is no name", () => {
    expect(summarizeAddresses("a@x.com, Bo <b@x.com>")).toBe("a@x.com, Bo");
    expect(summarizeAddresses(to, 1)).toBe("Ryan Verbuyst +2");
  });

  it("is empty for no header", () => {
    expect(summarizeAddresses(null)).toBe("");
  });
});

describe("pulledEmailDate", () => {
  it("uses Google's receive time when there is one", () => {
    expect(
      pulledEmailDate({ internalDate: 1792600225000, date: "Wed, 21 Oct 2026 12:30:25 -0400" }),
    ).toBe(new Date(1792600225000).toISOString());
  });

  it("falls back to the Date header, then to nothing", () => {
    expect(pulledEmailDate({ internalDate: null, date: "Wed, 21 Oct 2026 12:30:25 -0400" })).toBe(
      "2026-10-21T16:30:25.000Z",
    );
    expect(pulledEmailDate({ internalDate: null, date: "garbage" })).toBeNull();
    expect(pulledEmailDate({ internalDate: null, date: null })).toBeNull();
  });
});

describe("decodeSnippet", () => {
  it("turns the entities Gmail escapes snippets with back into characters", () => {
    expect(decodeSnippet("isn&#39;t &quot;ready&quot; &amp; Q&amp;A &lt;3 &gt; 2")).toBe(
      'isn\'t "ready" & Q&A <3 > 2',
    );
  });

  it("reads numeric entities in decimal and hex, and a few common names", () => {
    expect(decodeSnippet("caf&#233; &#x2019;s&nbsp;x &apos;hi&apos;")).toBe("café ’s x 'hi'");
  });

  it("decodes once, so an escaped entity stays as typed", () => {
    expect(decodeSnippet("&amp;lt; and &amp;#39;")).toBe("&lt; and &#39;");
  });

  it("leaves unknown entities, bare ampersands and out-of-range numbers alone", () => {
    expect(decodeSnippet("AT&T &bogus; &#99999999999; fish & chips")).toBe(
      "AT&T &bogus; &#99999999999; fish & chips",
    );
  });
});

describe("storedToActivityEmail", () => {
  it("decodes the snippet's entities for display", () => {
    expect(
      storedToActivityEmail({
        id: "u",
        from_address: null,
        to_addresses: null,
        subject: "x",
        date: null,
        snippet: "It isn&#39;t late",
        direction: "received",
      }).snippet,
    ).toBe("It isn't late");
  });

  it("shapes a stored row, reading the stored date and treating unknown directions as received", () => {
    expect(
      storedToActivityEmail({
        id: "uuid-1",
        from_address: "Pat <pat@xyz.com>",
        to_addresses: "me@co.com",
        subject: null,
        date: "2026-10-21 16:30:25+00",
        snippet: null,
        direction: "sent",
      }),
    ).toEqual({
      key: "uuid-1",
      subject: "(no subject)",
      from: "Pat",
      to: "me@co.com",
      date: "2026-10-21T16:30:25.000Z",
      snippet: "",
      direction: "sent",
      status: "success",
      errorText: null,
    });

    expect(
      storedToActivityEmail({
        id: "u",
        from_address: null,
        to_addresses: null,
        subject: "x",
        date: null,
        snippet: "s",
        direction: "weird",
      }).direction,
    ).toBe("received");
  });
});

describe("storedToActivityEmail status", () => {
  const stored = (over: { status?: string | null; error_text?: string | null }) =>
    storedToActivityEmail({
      id: "u",
      from_address: null,
      to_addresses: null,
      subject: "x",
      date: null,
      snippet: "s",
      direction: "sent",
      ...over,
    });

  it("carries the status and the reason it failed", () => {
    expect(stored({ status: "sending" })).toMatchObject({ status: "sending", errorText: null });
    expect(stored({ status: "error", error_text: "Gmail could not send it" })).toMatchObject({
      status: "error",
      errorText: "Gmail could not send it",
    });
    expect(stored({ status: "draft" }).status).toBe("draft");
  });

  it("treats a row with no status, as a pull saves it on this device, as a normal email", () => {
    expect(stored({ status: null }).status).toBe("success");
    expect(stored({}).status).toBe("success");
  });
});

describe("personNameParts", () => {
  it("takes the first and last word of a name", () => {
    expect(personNameParts("Pat Smith")).toEqual({ firstName: "Pat", lastName: "Smith" });
    expect(personNameParts("Pat Q. Smith")).toEqual({ firstName: "Pat", lastName: "Smith" });
    expect(personNameParts("Émile Zola")).toEqual({ firstName: "Émile", lastName: "Zola" });
  });

  it("gives a single word as a first name only", () => {
    expect(personNameParts("Pat")).toEqual({ firstName: "Pat", lastName: "" });
  });

  it("reads 'Last, First' the right way round, but not a company's 'Acme, Inc.'", () => {
    expect(personNameParts("Smith, Pat")).toEqual({ firstName: "Pat", lastName: "Smith" });
    expect(personNameParts("Acme, Inc.")).toEqual({ firstName: "Acme", lastName: "Inc." });
  });

  it("skips words that are not names, such as a bracketed company", () => {
    expect(personNameParts("Pat Smith (Acme)")).toEqual({ firstName: "Pat", lastName: "Smith" });
  });

  it("falls back to the part of an address before the @", () => {
    expect(personNameParts("pat.smith@xyz.com")).toEqual({ firstName: "pat", lastName: "smith" });
    expect(personNameParts("info@xyz.com")).toEqual({ firstName: "info", lastName: "" });
    expect(personNameParts("mike+news@xyz.com")).toEqual({ firstName: "mike", lastName: "" });
  });

  it("gives nothing for nothing", () => {
    expect(personNameParts("")).toEqual({ firstName: "", lastName: "" });
    expect(personNameParts("  ")).toEqual({ firstName: "", lastName: "" });
  });
});

describe("addressLines", () => {
  it("gives each person as 'Name <address>', or just the address when there is no name", () => {
    expect(addressLines('Pat Smith <pat@xyz.com>, "Smith, Jo" <jo@x.com>, plain@y.com')).toEqual([
      "Pat Smith <pat@xyz.com>",
      "Smith, Jo <jo@x.com>",
      "plain@y.com",
    ]);
  });

  it("gives a name that has no address as it is, and nothing for an empty header", () => {
    expect(addressLines("undisclosed-recipients:")).toEqual(["undisclosed-recipients:"]);
    expect(addressLines(null)).toEqual([]);
    expect(addressLines("  ")).toEqual([]);
  });
});

describe("personWithAddress", () => {
  it("writes 'Name (address)', or just the address when there is no name", () => {
    expect(personWithAddress({ name: "Josh Redgrift", address: "josh@co.com" })).toBe(
      "Josh Redgrift (josh@co.com)",
    );
    expect(personWithAddress({ name: null, address: "josh@co.com" })).toBe("josh@co.com");
  });
});

describe("replyRecipients", () => {
  const received = {
    direction: "received" as const,
    fromHeader: "Pat Smith <pat@xyz.com>",
    toHeader: "Josh <josh@co.com>, Paul <paul@co.com>",
  };

  it("answers the sender of an email that was received", () => {
    expect(replyRecipients(received, "josh@co.com")).toEqual([
      { name: "Pat Smith", address: "pat@xyz.com" },
    ]);
  });

  it("answers whoever an email we sent went to, leaving out the user's own address", () => {
    const sent = {
      direction: "sent" as const,
      fromHeader: "Josh <josh@co.com>",
      toHeader: "Pat Smith <pat@xyz.com>, Josh <JOSH@co.com>, sam@xyz.com",
    };

    expect(replyRecipients(sent, "josh@co.com")).toEqual([
      { name: "Pat Smith", address: "pat@xyz.com" },
      { name: null, address: "sam@xyz.com" },
    ]);
  });

  it("keeps the user's own address when it is the only one, and lists each address once", () => {
    const toSelf = { direction: "sent" as const, fromHeader: "", toHeader: "Josh <josh@co.com>" };
    const twice = { ...received, fromHeader: "Pat <pat@xyz.com>, PAT <Pat@xyz.com>" };

    expect(replyRecipients(toSelf, "josh@co.com")).toEqual([
      { name: "Josh", address: "josh@co.com" },
    ]);
    expect(replyRecipients(twice, null)).toEqual([{ name: "Pat", address: "pat@xyz.com" }]);
  });

  it("gives nobody when there is no one to answer", () => {
    expect(replyRecipients({ direction: "received", fromHeader: "", toHeader: "" }, null)).toEqual(
      [],
    );
  });
});

describe("replyAllRecipients", () => {
  const received = {
    direction: "received" as const,
    fromHeader: "Pat Smith <pat@xyz.com>",
    toHeader: "Josh <josh@co.com>, Paul <paul@co.com>",
    ccHeader: "Sam <sam@xyz.com>, Josh <josh@co.com>",
  };

  it("answers the sender and everyone else the email went to, and copies whoever was copied", () => {
    expect(replyAllRecipients(received, "josh@co.com")).toEqual({
      to: [
        { name: "Pat Smith", address: "pat@xyz.com" },
        { name: "Paul", address: "paul@co.com" },
      ],
      cc: [{ name: "Sam", address: "sam@xyz.com" }],
    });
  });

  it("leaves the user's own address out of both lists, whatever its case", () => {
    const { to, cc } = replyAllRecipients(received, "JOSH@co.com");

    expect([...to, ...cc].some((person) => person.address.toLowerCase() === "josh@co.com")).toBe(
      false,
    );
  });

  it("answers whoever an email we sent went to, and copies whoever we copied", () => {
    const sent = {
      direction: "sent" as const,
      fromHeader: "Josh <josh@co.com>",
      toHeader: "Pat Smith <pat@xyz.com>, alex@xyz.com",
      ccHeader: "Sam <sam@xyz.com>",
    };

    expect(replyAllRecipients(sent, "josh@co.com")).toEqual({
      to: [
        { name: "Pat Smith", address: "pat@xyz.com" },
        { name: null, address: "alex@xyz.com" },
      ],
      cc: [{ name: "Sam", address: "sam@xyz.com" }],
    });
  });

  it("lists each address once, and not in Cc when it is already in To", () => {
    const messy = {
      direction: "received" as const,
      fromHeader: "Pat <pat@xyz.com>",
      toHeader: "PAT <Pat@xyz.com>, Paul <paul@co.com>",
      ccHeader: "paul@co.com, Sam <sam@xyz.com>, SAM <sam@XYZ.com>",
    };

    expect(replyAllRecipients(messy, null)).toEqual({
      to: [
        { name: "Pat", address: "pat@xyz.com" },
        { name: "Paul", address: "paul@co.com" },
      ],
      cc: [{ name: "Sam", address: "sam@xyz.com" }],
    });
  });

  it("keeps the user's own address in To when it is the only one, and has no Cc then", () => {
    const toSelf = {
      direction: "sent" as const,
      fromHeader: "Josh <josh@co.com>",
      toHeader: "Josh <josh@co.com>",
      ccHeader: "",
    };

    expect(replyAllRecipients(toSelf, "josh@co.com")).toEqual({
      to: [{ name: "Josh", address: "josh@co.com" }],
      cc: [],
    });
  });

  it("removes nobody while the user's own address is not known yet", () => {
    const { to, cc } = replyAllRecipients(received, null);

    expect(to.map((person) => person.address)).toEqual([
      "pat@xyz.com",
      "josh@co.com",
      "paul@co.com",
    ]);
    expect(cc.map((person) => person.address)).toEqual(["sam@xyz.com"]);
  });

  it("ignores entries with no address and gives nobody for an email with no recipients", () => {
    expect(
      replyAllRecipients(
        { direction: "received", fromHeader: "", toHeader: "undisclosed-recipients", ccHeader: "" },
        null,
      ),
    ).toEqual({ to: [], cc: [] });
  });
});
