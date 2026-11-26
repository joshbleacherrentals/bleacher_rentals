import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { PeriodDropdown } from "./PeriodDropdown";

// docs/specs/dashboard-analytics-05-page.md §2.2 and R3. The real DropdownMenu opens in a portal,
// which a render to text cannot show, so its parts are replaced by plain stand-ins that print their
// props. What is under test is what the page hands to the menu: the options in order, the value of
// the group, one radio item per option, the tick, and the handler. Opening, arrows, Enter, Escape
// and a click outside are Radix's own and are covered by e2e S7.

const captured = vi.hoisted(() => ({
  onValueChange: undefined as undefined | ((value: string) => void),
  contentProps: undefined as undefined | Record<string, unknown>,
}));

vi.mock("@/components/ui/dropdown-menu", async () => {
  const React = await import("react");
  const GroupValue = React.createContext<string | undefined>(undefined);
  return {
    DropdownMenu: ({ children }: { children: React.ReactNode }) => (
      <div data-menu="">{children}</div>
    ),
    DropdownMenuTrigger: ({ children }: { children: React.ReactNode }) => <>{children}</>,
    DropdownMenuContent: ({
      children,
      ...props
    }: { children: React.ReactNode } & Record<string, unknown>) => {
      captured.contentProps = props;
      return <div role="menu">{children}</div>;
    },
    DropdownMenuRadioGroup: ({
      value,
      onValueChange,
      children,
    }: {
      value: string;
      onValueChange: (value: string) => void;
      children: React.ReactNode;
    }) => {
      captured.onValueChange = onValueChange;
      return (
        <GroupValue.Provider value={value}>
          <div role="group" data-value={value}>
            {children}
          </div>
        </GroupValue.Provider>
      );
    },
    DropdownMenuRadioItem: ({ value, children }: { value: string; children: React.ReactNode }) => {
      const groupValue = React.useContext(GroupValue);
      return (
        <div role="menuitemradio" data-value={value} aria-checked={groupValue === value}>
          {children}
        </div>
      );
    },
  };
});

const OPTIONS = [
  { value: "2026", label: "2026", checked: true },
  { value: "2025", label: "2025", checked: false },
  { value: "all", label: "All time", checked: false },
];

const render = (label = "2026", options = OPTIONS, onChange: (value: string) => void = () => {}) =>
  renderToStaticMarkup(<PeriodDropdown label={label} options={options} onChange={onChange} />);

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The radio items in order: the attributes of each tag and what is inside it. */
const items = (markup: string) =>
  markup
    .split('role="menuitemradio"')
    .slice(1)
    .map((part) => {
      const whole = part.split("</div>")[0];
      const end = whole.indexOf(">");
      return { attrs: whole.slice(0, end), inner: whole.slice(end + 1) };
    });

describe("PeriodDropdown", () => {
  beforeEach(() => {
    captured.onValueChange = undefined;
    captured.contentProps = undefined;
  });

  it("is a button named Period that shows the chosen label", () => {
    const markup = render("All time");
    expect(markup).toContain('aria-label="Period"');
    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(text(button)).toBe("All time");
  });

  it("has a calendar icon and a chevron in the 40 px button", () => {
    const markup = render();
    const button = markup.slice(markup.indexOf("<button"), markup.indexOf("</button>"));
    expect(button.match(/<svg/g)).toHaveLength(2);
    expect(button).toContain("h-10");
  });

  it("makes one radio item per option, in the given order", () => {
    const list = items(render());
    expect(list).toHaveLength(3);
    expect(list.map((item) => text(item.inner))).toEqual(["2026", "2025", "All time"]);
    expect(list.map((item) => item.attrs.match(/data-value="([^"]*)"/)?.[1])).toEqual([
      "2026",
      "2025",
      "all",
    ]);
  });

  it("gives the group the value of the ticked option", () => {
    const markup = render();
    expect(markup).toContain('role="group" data-value="2026"');
    const list = items(markup);
    expect(list.map((item) => item.attrs.includes('aria-checked="true"'))).toEqual([
      true,
      false,
      false,
    ]);
  });

  it("draws the tick only beside the ticked option", () => {
    const list = items(
      render("All time", [
        { value: "2026", label: "2026", checked: false },
        { value: "2025", label: "2025", checked: false },
        { value: "all", label: "All time", checked: true },
      ]),
    );
    expect(list.map((item) => item.inner.includes('data-testid="period-tick"'))).toEqual([
      false,
      false,
      true,
    ]);
  });

  it("opens the list under the button, at its right edge", () => {
    render();
    expect(captured.contentProps?.align).toBe("end");
  });

  it("hands the chosen value to onChange", () => {
    const onChange = vi.fn();
    render("2026", OPTIONS, onChange);
    captured.onValueChange?.("2025");
    expect(onChange).toHaveBeenCalledWith("2025");
  });
});
