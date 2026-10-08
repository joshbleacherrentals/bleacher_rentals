import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { DataTable, type Column, type DataTableSort } from "./DataTable";

type Row = { id: string; name: string };

const columns: Column<Row>[] = [
  { key: "name", header: "Name", sortKey: "name", render: (r) => r.name },
  { key: "plain", header: "Plain", render: () => "-" },
];

const render = (sort?: DataTableSort, onSort?: (key: string) => void) =>
  renderToStaticMarkup(
    <DataTable
      columns={columns}
      data={[{ id: "1", name: "A" }]}
      keyExtractor={(r) => r.id}
      sort={sort}
      onSort={onSort}
    />,
  );

describe("DataTable sorting", () => {
  it("makes only sortable headers clickable", () => {
    const html = render(undefined, () => {});
    expect(html.match(/<button/g)).toHaveLength(1);
  });

  it("marks the active column with its direction", () => {
    expect(render({ key: "name", direction: "asc" }, () => {})).toContain('aria-sort="ascending"');
    expect(render({ key: "name", direction: "desc" }, () => {})).toContain(
      'aria-sort="descending"',
    );
  });

  it("renders plain headers when the table is not sortable", () => {
    expect(render()).not.toContain("<button");
  });
});

describe("DataTable header tooltips", () => {
  const withTip: Column<Row>[] = [
    {
      key: "name",
      header: "Name",
      sortKey: "name",
      headerTooltip: { label: "About Name", content: "Names things" },
      render: () => "-",
    },
    { key: "plain", header: "Plain", sortKey: "plain", render: () => "-" },
  ];
  const renderTip = () =>
    renderToStaticMarkup(
      <DataTable
        columns={withTip}
        data={[{ id: "1", name: "A" }]}
        keyExtractor={(r) => r.id}
        onSort={() => {}}
      />,
    );

  it("adds an info icon only to the column that asks for one", () => {
    expect(renderTip().match(/aria-label="About Name"/g)).toHaveLength(1);
  });

  it("keeps the icon out of the sort button, so clicking it never sorts", () => {
    const html = renderTip();
    const sortButton = html.match(/<button[^>]*>.*?<\/button>/)![0];
    expect(sortButton).toContain("Name");
    expect(sortButton).not.toContain("aria-label=");
    expect(html.match(/<button/g)).toHaveLength(3);
  });

  it("leaves a column without a tooltip exactly as before", () => {
    const html = renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={[{ id: "1", name: "A" }]}
        keyExtractor={(r) => r.id}
        onSort={() => {}}
      />,
    );
    expect(html).not.toContain("aria-label=");
  });
});

describe("DataTable row links", () => {
  const rows: Row[] = [
    { id: "1", name: "A" },
    { id: "2", name: "B" },
  ];
  const renderLinks = (props: { withHref: boolean; onRowClick?: () => void }) =>
    renderToStaticMarkup(
      <DataTable
        columns={columns}
        data={rows}
        keyExtractor={(r) => r.id}
        getRowHref={props.withHref ? (r) => `/quotes-bookings/${r.id}` : undefined}
        onRowClick={props.onRowClick}
      />,
    );

  it("turns every cell of every row into a real link to that row's page", () => {
    const html = renderLinks({ withHref: true });
    // 2 rows x 2 columns. Each is an anchor, so Cmd-click and "Open in New Tab" work anywhere on the row.
    expect(html.match(/<a /g)).toHaveLength(4);
    expect(html.match(/href="\/quotes-bookings\/1"/g)).toHaveLength(2);
    expect(html.match(/href="\/quotes-bookings\/2"/g)).toHaveLength(2);
  });

  it("gives a row one tab stop: only its first cell's link is focusable", () => {
    const html = renderLinks({ withHref: true });
    expect(html.match(/tabindex="-1"/g)).toHaveLength(2); // the second cell of each row
  });

  it("renders the links even when a click handler is also passed — the href wins", () => {
    expect(renderLinks({ withHref: true, onRowClick: () => {} }).match(/<a /g)).toHaveLength(4);
  });

  it("renders no links at all without getRowHref, and keeps the cell padding other tables rely on", () => {
    const html = renderLinks({ withHref: false, onRowClick: () => {} });
    expect(html).not.toContain("<a ");
    expect(html).toContain("px-4 py-4");
  });
});
