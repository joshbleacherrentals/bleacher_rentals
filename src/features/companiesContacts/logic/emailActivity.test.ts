import { describe, expect, it } from "vitest";
import {
  parseAddressList,
  personNameParts,
  pulledEmailDate,
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
