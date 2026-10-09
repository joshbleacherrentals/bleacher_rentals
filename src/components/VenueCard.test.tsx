import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { VenueCard } from "./VenueCard";
import type { VenuePickerValue } from "@/features/venues/types";

const venueValue: VenuePickerValue = {
  mode: "venue",
  venueId: "v1",
  name: "Lincoln High School Stadium",
  address: {
    street: "195226 Allen Street",
    city: "Springfield",
    stateProvince: "IL",
    zipPostal: "62701",
  },
};

const manualValue: VenuePickerValue = {
  mode: "manual",
  venueId: null,
  address: {
    street: "195226 Allen Street",
    city: "Springfield",
    stateProvince: "IL",
    zipPostal: "62701",
  },
};

const emptyValue: VenuePickerValue = { mode: "empty", venueId: null, address: null };

describe("VenueCard", () => {
  it("renders the venue name, street, city/state and zip as separate lines", () => {
    const html = renderToStaticMarkup(<VenueCard value={venueValue} />);
    expect(html).toContain("Lincoln High School Stadium");
    expect(html).toContain("195226 Allen Street");
    expect(html).toContain("Springfield, IL");
    expect(html).toContain("62701");
  });

  it("renders no bold name line for a manual (venue-less) address", () => {
    const html = renderToStaticMarkup(<VenueCard value={manualValue} />);
    expect(html).not.toContain("font-semibold");
    expect(html).toContain("195226 Allen Street");
    expect(html).toContain("Springfield, IL");
  });

  it("shows the placeholder when nothing is picked", () => {
    const html = renderToStaticMarkup(<VenueCard value={emptyValue} />);
    expect(html).toContain("Select venue...");
  });

  it("renders the card as a button when onClick is provided, a div otherwise", () => {
    const buttonsIn = (html: string) => html.match(/<button/g)?.length ?? 0;
    const clickable = renderToStaticMarkup(<VenueCard value={venueValue} onClick={() => {}} />);
    const staticCard = renderToStaticMarkup(<VenueCard value={venueValue} />);
    // The copy button is always there; the card itself is a second button only when clickable.
    expect(buttonsIn(clickable)).toBe(2);
    expect(buttonsIn(staticCard)).toBe(1);
  });

  it("never nests the copy button inside the clickable card — a button cannot contain a button", () => {
    const html = renderToStaticMarkup(<VenueCard value={venueValue} onClick={() => {}} />);
    const card = html.match(/<button[^>]*>[\s\S]*?<\/button>/)![0];
    expect(card).not.toContain("Copy address");
  });

  it("offers a Copy address button when there is an address", () => {
    expect(renderToStaticMarkup(<VenueCard value={venueValue} />)).toContain(
      'aria-label="Copy address"',
    );
    expect(renderToStaticMarkup(<VenueCard value={manualValue} />)).toContain(
      'aria-label="Copy address"',
    );
  });

  it("offers nothing to copy when no venue is picked", () => {
    expect(renderToStaticMarkup(<VenueCard value={emptyValue} />)).not.toContain("Copy address");
  });
});
