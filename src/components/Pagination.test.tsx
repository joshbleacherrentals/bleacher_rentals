import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Pagination } from "./Pagination";

const render = (props: { page: number; pageSize: 25 | 50 | 100; totalItems: number }) =>
  renderToStaticMarkup(
    <Pagination {...props} onPageChange={() => {}} onPageSizeChange={() => {}} />,
  );

describe("Pagination", () => {
  it("tells the user which rows they are looking at", () => {
    expect(render({ page: 2, pageSize: 25, totalItems: 213 })).toContain("26–50 of 213");
  });

  it("offers 25, 50 and 100 rows per page, with the active size selected", () => {
    const html = render({ page: 1, pageSize: 50, totalItems: 213 });
    for (const size of [25, 50, 100]) {
      expect(html).toContain(`value="${size}"`);
    }
    expect(html).toContain('name="pageSize"');
    // The <select> is rendered controlled, so the active size is what the
    // markup reports as selected.
    expect(html).toMatch(/<option value="50" selected/);
  });

  it("marks the current page for assistive tech and disables the edges", () => {
    const html = render({ page: 1, pageSize: 25, totalItems: 213 });
    expect(html).toContain('aria-current="page"');
    expect(html).toMatch(/aria-label="Previous page" disabled=""/);
    expect(html).not.toMatch(/aria-label="Next page" disabled=""/);
  });

  it("disables Next on the last page", () => {
    const html = render({ page: 9, pageSize: 25, totalItems: 213 });
    expect(html).toMatch(/aria-label="Next page" disabled=""/);
  });

  it("jumps straight to a far page instead of making the user click through", () => {
    // 213 rows at 25/page = 9 pages: page 9 must be one click away from page 1.
    expect(render({ page: 1, pageSize: 25, totalItems: 213 })).toContain(
      'aria-label="Go to page 9"',
    );
  });

  it("drops the page buttons when everything fits, but keeps the size selector", () => {
    // Otherwise picking 100 on a short list would hide the only control that
    // lets the user go back to 25.
    const html = render({ page: 1, pageSize: 100, totalItems: 12 });
    expect(html).toContain('name="pageSize"');
    expect(html).not.toContain('aria-label="Next page"');
    expect(html).toContain("1–12 of 12");
  });
});
