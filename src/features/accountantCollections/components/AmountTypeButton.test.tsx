import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AMOUNT_TYPES, type CollectionsAmountType } from "../utils/collectionsListState";
import { AmountTypeButton } from "./AmountTypeButton";

// Spec: docs/specs/accountant-collections-23-amount-type-switch.md §1 (Look) and §5. Static markup
// for what the button looks like in each state; the click is read from the element the component
// returns (the component has no hooks, so it can be called as a function).

const render = (type: CollectionsAmountType) =>
  renderToStaticMarkup(<AmountTypeButton type={type} onChange={() => {}} />);

const attr = (html: string, name: string) =>
  new RegExp(`<button[^>]*\\s${name}="([^"]*)"`).exec(html)?.[1];

const LABEL: Record<CollectionsAmountType, string> = {
  collections: "Collections",
  deposits: "Deposits",
  all: "All",
};
const NEXT_LABEL: Record<CollectionsAmountType, string> = {
  collections: "Deposits",
  deposits: "All",
  all: "Collections",
};
// The colours stay with their place in the cycle (the design's Main.dc.html, spec 23 §1).
const COLOURS: Record<CollectionsAmountType, [string, string]> = {
  collections: ["#2f6fb8", "#1d62a3"],
  deposits: ["#0e7f61", "#0b6e55"],
  all: ["#6b7280", "#4b5563"],
};

describe("AmountTypeButton: label", () => {
  it.each(AMOUNT_TYPES)("says %s", (type) => {
    const html = render(type);
    expect(html).toContain(`<span>${LABEL[type]}</span>`);
  });

  it("does not use the design's old name, Full amount", () => {
    for (const type of AMOUNT_TYPES) expect(render(type)).not.toContain("Full amount");
  });

  it("is one button of type button, with the filter icon before the label", () => {
    const html = render("collections");
    expect(html.match(/<button/g)).toHaveLength(1);
    expect(attr(html, "type")).toBe("button");
    expect(html).toMatch(/<svg[^>]*aria-hidden="true"/);
    expect(html.indexOf("<svg")).toBeLessThan(html.indexOf("<span>Collections</span>"));
    expect(html).toContain("lucide-list-filter");
  });
});

describe("AmountTypeButton: title and aria-label", () => {
  it.each(AMOUNT_TYPES)("names the next value in the title when it shows %s", (type) => {
    expect(attr(render(type), "title")).toBe(`Click to show ${NEXT_LABEL[type]}`);
  });

  it.each(AMOUNT_TYPES)("says what it shows and what a click does when it shows %s", (type) => {
    expect(attr(render(type), "aria-label")).toBe(
      `Showing: ${LABEL[type]}. Click to switch to ${NEXT_LABEL[type]}.`,
    );
  });

  it("reads Click to show Deposits on Collections, and Click to show Collections on All", () => {
    expect(attr(render("collections"), "title")).toBe("Click to show Deposits");
    expect(attr(render("all"), "title")).toBe("Click to show Collections");
  });
});

describe("AmountTypeButton: look", () => {
  it.each(AMOUNT_TYPES)(
    "is 36 px high with 8 px radius, white bold 14 px text, a shadow: %s",
    (type) => {
      const classes = (attr(render(type), "class") ?? "").split(/\s+/);
      expect(classes).toContain("h-9");
      expect(classes).toContain("rounded-lg");
      expect(classes).toContain("text-sm");
      expect(classes).toContain("text-white");
      expect(classes.some((c) => c === "font-semibold" || c === "font-bold")).toBe(true);
      expect(classes.some((c) => c.startsWith("shadow"))).toBe(true);
      expect(classes).toContain("whitespace-nowrap");
    },
  );

  it.each(AMOUNT_TYPES)("has the colours of its place in the cycle: %s", (type) => {
    const classes = attr(render(type), "class") ?? "";
    expect(classes).toContain("bg-gradient-to-r");
    expect(classes).toContain(`from-[${COLOURS[type][0]}]`);
    expect(classes).toContain(`to-[${COLOURS[type][1]}]`);
  });

  it("gives each type a colour of its own", () => {
    const classes = AMOUNT_TYPES.map((type) => attr(render(type), "class"));
    expect(new Set(classes).size).toBe(3);
  });
});

describe("AmountTypeButton: click", () => {
  const clickOn = (type: CollectionsAmountType) => {
    const onChange = vi.fn();
    const element = AmountTypeButton({ type, onChange }) as ReactElement<{
      onClick: () => void;
    }>;
    element.props.onClick();
    return onChange;
  };

  it("asks for the next value: Collections, Deposits, All, and Collections again", () => {
    expect(clickOn("collections")).toHaveBeenCalledExactlyOnceWith("deposits");
    expect(clickOn("deposits")).toHaveBeenCalledExactlyOnceWith("all");
    expect(clickOn("all")).toHaveBeenCalledExactlyOnceWith("collections");
  });
});
