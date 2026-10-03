import { describe, it, expect, vi } from "vitest";
import { renderToString } from "react-dom/server";

vi.mock("../db/workTrackerGroupPaid", () => ({ setWorkTrackerGroupPaid: vi.fn() }));
vi.mock("@/components/toasts/SuccessToast", () => ({ createSuccessToast: vi.fn() }));
vi.mock("@/components/toasts/ErrorToast", () => ({ createErrorToastNoThrow: vi.fn() }));

const { MarkPaidButton } = await import("./MarkPaidButton");

function render(props: Partial<Parameters<typeof MarkPaidButton>[0]> = {}) {
  return renderToString(
    <MarkPaidButton
      groupId="g-1"
      driverName="Justin Kowalsky"
      isPaid={false}
      canMarkPaid
      {...props}
    />,
  );
}

describe("MarkPaidButton", () => {
  it("offers Mark Paid while the week is unpaid", () => {
    const html = render({ isPaid: false });
    expect(html).toContain("Mark Paid");
    expect(html).not.toContain("Mark Unpaid");
  });

  it("offers Mark Unpaid once the week is paid", () => {
    const html = render({ isPaid: true });
    expect(html).toContain("Mark Unpaid");
    expect(html).not.toContain("Mark Paid");
  });

  it("is a button an e2e test can find", () => {
    expect(render()).toContain('data-testid="mark-paid-button"');
  });

  it("is not rendered at all for a role that may not mark a week paid", () => {
    expect(render({ canMarkPaid: false })).toBe("");
    expect(render({ canMarkPaid: false, isPaid: true })).toBe("");
  });

  it("is not rendered for a week that has no group yet — there is nothing to mark", () => {
    expect(render({ groupId: null })).toBe("");
  });

  it("starts enabled", () => {
    // The attribute, not the word: the Tailwind classes on every button contain `disabled:`.
    expect(render()).not.toContain('disabled=""');
  });
});
