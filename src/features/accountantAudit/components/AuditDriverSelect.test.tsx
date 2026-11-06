import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { Fragment, type ReactNode } from "react";

// docs/specs/accountant-audit-02-driver-select.md §3, §5 (R2, R4, D12). The popover content is not
// rendered while the select is closed, so SelectUserDropDown is replaced by a probe that keeps the
// props it was given.
const seen: { props: any } = { props: null };
vi.mock("@/components/SelectUserDropDown", () => ({
  SelectUserDropDown: (props: any) => {
    seen.props = props;
    return (
      <div data-testid="probe">
        {props.options.map((o: any) => (
          <Fragment key={o.id}>{props.renderOptionExtra?.(o)}</Fragment>
        ))}
      </div>
    );
  },
}));

import { AuditDriverSelect } from "./AuditDriverSelect";
import type { AuditDriverOption } from "../utils/auditDrivers";

const opt = (id: string, first: string, isInactive = false): AuditDriverOption => ({
  id,
  driverUuid: id,
  clerkUserId: `c-${id}`,
  firstName: first,
  lastName: "Roe",
  email: `${id}@x.com`,
  isInactive,
});

const render = (over: Partial<Parameters<typeof AuditDriverSelect>[0]> = {}) => {
  const onChange = vi.fn();
  const html = renderToStaticMarkup(
    <AuditDriverSelect
      options={[opt("a", "Ann"), opt("b", "Bob", true)]}
      isLoading={false}
      value={null}
      onChange={onChange}
      {...over}
    />,
  );
  return { html, onChange };
};

beforeEach(() => {
  seen.props = null;
});

describe("AuditDriverSelect", () => {
  it("passes the options in the order given, with the texts of R4", () => {
    render();
    expect(seen.props.options.map((o: AuditDriverOption) => o.id)).toEqual(["a", "b"]);
    expect(seen.props.placeholder).toBe("Choose driver");
    expect(seen.props.searchPlaceholder).toBe("Search drivers...");
    expect(seen.props.emptyMessage).toBe("No driver found.");
    expect(seen.props.getOptionId(opt("a", "Ann"))).toBe("a");
    expect(seen.props.getSearchValue(opt("a", "Ann"))).toContain("a@x.com");
    expect(seen.props.getSearchValue(opt("a", "Ann"))).toContain("Ann");
  });

  it("draws the Inactive label on an inactive driver only", () => {
    const { html } = render();
    expect(html.match(/Inactive/g)).toHaveLength(1);
    expect(seen.props.renderOptionExtra(opt("a", "Ann"))).toBeNull();
    const extra = renderToStaticMarkup(
      seen.props.renderOptionExtra(opt("b", "Bob", true)) as ReactNode,
    );
    expect(extra).toContain(">Inactive<");
  });

  it("passes the value and the loading flag through", () => {
    render({ value: "a", isLoading: true });
    expect(seen.props.value).toBe("a");
    expect(seen.props.isLoading).toBe(true);
  });

  it("gives onChange the id, and null on clear", () => {
    const { onChange } = render();
    seen.props.onChange("a");
    seen.props.onChange(null);
    expect(onChange).toHaveBeenNthCalledWith(1, "a");
    expect(onChange).toHaveBeenNthCalledWith(2, null);
  });

  it("is 360px wide", () => {
    expect(render().html).toContain("w-[360px]");
  });
});
