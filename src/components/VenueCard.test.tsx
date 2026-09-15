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

  it("renders as a button when onClick is provided, a div otherwise", () => {
    const clickable = renderToStaticMarkup(<VenueCard value={venueValue} onClick={() => {}} />);
    const staticCard = renderToStaticMarkup(<VenueCard value={venueValue} />);
    expect(clickable.startsWith("<button")).toBe(true);
    expect(staticCard.startsWith("<div")).toBe(true);
  });
});
