import { describe, it, expect } from "vitest";
import { PLACE_MAP_START_ZOOM, placeMapEmbedUrl } from "./placeMapEmbedUrl";

describe("placeMapEmbedUrl", () => {
  it("pins the coordinates and opens at the regional zoom, not street level", () => {
    const url = new URL(placeMapEmbedUrl(42.9, -80.3, "KEY"));
    expect(url.origin + url.pathname).toBe("https://www.google.com/maps/embed/v1/place");
    expect(url.searchParams.get("key")).toBe("KEY");
    expect(url.searchParams.get("q")).toBe("42.9,-80.3");
    expect(url.searchParams.get("zoom")).toBe(String(PLACE_MAP_START_ZOOM));
    expect(PLACE_MAP_START_ZOOM).toBeLessThanOrEqual(8);
  });
});
