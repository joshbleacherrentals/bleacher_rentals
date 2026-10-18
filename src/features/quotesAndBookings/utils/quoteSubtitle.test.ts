import { describe, expect, it } from "vitest";
import { quoteSubtitle } from "./quoteSubtitle";

const contact = { id: "c", firstName: "Marisol", lastName: "Vantreese", email: null, phone: null };
const address = {
  street: "12 Main St",
  city: "Calgary",
  stateProvince: "AB",
  zipPostal: "T2P 1A1",
};

describe("quoteSubtitle", () => {
  it("joins status, contact name, venue name and zip", () => {
    expect(
      quoteSubtitle({
        eventStatus: "quoted",
        contact,
        venue: { id: "v", name: "Bullhead Arena" },
        address,
      }),
    ).toBe("Quoted • Marisol Vantreese • Bullhead Arena | T2P 1A1");
  });

  it("falls back to street | zip when there is no venue", () => {
    expect(quoteSubtitle({ eventStatus: "booked", contact, venue: null, address })).toBe(
      "Booked • Marisol Vantreese • 12 Main St | T2P 1A1",
    );
  });

  it("uses the street alone when the address has no zip", () => {
    expect(
      quoteSubtitle({
        eventStatus: "draft",
        contact,
        venue: null,
        address: { ...address, zipPostal: null },
      }),
    ).toBe("Draft • Marisol Vantreese • 12 Main St");
  });

  it("shows the venue name without a zip when the quote has no address", () => {
    expect(
      quoteSubtitle({
        eventStatus: "quoted",
        contact,
        venue: { id: "v", name: "Bullhead Arena" },
        address: null,
      }),
    ).toBe("Quoted • Marisol Vantreese • Bullhead Arena");
  });

  it("leaves out what the quote does not have", () => {
    expect(
      quoteSubtitle({
        eventStatus: "lost",
        contact: { ...contact, lastName: null },
        venue: null,
        address: null,
      }),
    ).toBe("Lost • Marisol");
    expect(quoteSubtitle({ eventStatus: null, contact: null, venue: null, address: null })).toBe(
      "",
    );
  });
});
