import { beforeEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";

// Spec: docs/specs/accountant-collections-19-task-delete.md §1, §3, §5 and §7.
//
// The window is the real `Dialog` of the project (the X, the title, the footer), with one change: a
// Radix portal draws nothing on the server, so here it draws in place. `Root` and `Content` are
// wrapped only to keep the props they were given, which is how Esc, an outside click and the
// focus on No are checked without a DOM. The click on Yes is `runTaskDelete`, run with stand-ins.
const mocks = vi.hoisted(() => ({
  root: null as null | { open?: boolean; onOpenChange?: (open: boolean) => void },
  content: null as null | {
    onOpenAutoFocus?: (event: { preventDefault: () => void }) => void;
  },
}));

vi.mock("@radix-ui/react-dialog", async (importActual) => {
  const actual = await importActual<typeof import("@radix-ui/react-dialog")>();
  const React = await import("react");
  return {
    ...actual,
    Portal: ({ children }: { children?: React.ReactNode }) => <>{children}</>,
    Root: (props: React.ComponentProps<typeof actual.Root>) => {
      mocks.root = props;
      return <actual.Root {...props} />;
    },
    Content: React.forwardRef<HTMLDivElement, React.ComponentProps<typeof actual.Content>>(
      (props, ref) => {
        mocks.content = props as typeof mocks.content;
        return <actual.Content ref={ref} {...props} />;
      },
    ),
  };
});

import { DeleteTaskDialog, runTaskDelete } from "./DeleteTaskDialog";

const noop = () => {};

function render(over: Partial<Parameters<typeof DeleteTaskDialog>[0]> = {}) {
  return renderToStaticMarkup(
    <DeleteTaskDialog number={3} busy={false} onConfirm={noop} onClose={noop} {...over} />,
  );
}

/** The text of the window, tags and comments out. */
const textOf = (html: string) =>
  html
    .replace(/<!--.*?-->/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The opening tag of the button whose only content is this text. */
function buttonLabelled(html: string, label: string): string {
  const match = new RegExp(`<button[^>]*>${label}</button>`).exec(html);
  if (!match) throw new Error(`no button labelled ${label}`);
  return /^<button[^>]*>/.exec(match[0])![0];
}

/** The attribute, not the `disabled:` classes every button of the project carries. */
const isDisabled = (tag: string) => /\sdisabled=""/.test(tag);

beforeEach(() => {
  mocks.root = null;
  mocks.content = null;
});

describe("DeleteTaskDialog: what it says", () => {
  it("draws nothing while no task is chosen", () => {
    expect(render({ number: null })).toBe("");
    expect(mocks.root?.open).toBe(false);
  });

  it("is open when a task number is given, as a dialog", () => {
    const html = render();
    expect(mocks.root?.open).toBe(true);
    expect(html).toContain('role="dialog"');
  });

  it('has the title "Are you sure?"', () => {
    expect(render()).toMatch(/<h2[^>]*>Are you sure\?<\/h2>/);
  });

  it("says which task will be deleted, by the number of its row", () => {
    expect(textOf(render({ number: 3 }))).toContain("Task #3 will be deleted from the history.");
    expect(textOf(render({ number: 12 }))).toContain("Task #12 will be deleted from the history.");
  });

  it("has the buttons No and Yes, No first", () => {
    const html = render();
    const no = html.indexOf(">No</button>");
    const yes = html.indexOf(">Yes</button>");
    expect(no).toBeGreaterThan(-1);
    expect(yes).toBeGreaterThan(no);
  });

  it("draws No outlined and Yes in the red of the Files delete, #a8403a", () => {
    const html = render();
    expect(buttonLabelled(html, "No")).toMatch(/border/);
    expect(buttonLabelled(html, "No")).not.toContain("a8403a");
    expect(buttonLabelled(html, "Yes")).toContain("bg-[#a8403a]");
  });

  it("has an X in the corner, named Close", () => {
    const html = render();
    expect(html).toMatch(/<button[^>]*>(?:(?!<\/button>)[^])*<span class="sr-only">Close<\/span>/);
  });

  it("is a plain button pair: neither No nor Yes submits a form", () => {
    const html = render();
    expect(buttonLabelled(html, "No")).toContain('type="button"');
    expect(buttonLabelled(html, "Yes")).toContain('type="button"');
  });
});

describe("DeleteTaskDialog: while the delete runs", () => {
  it("leaves No and Yes enabled when nothing runs", () => {
    const html = render({ busy: false });
    expect(isDisabled(buttonLabelled(html, "No"))).toBe(false);
    expect(isDisabled(buttonLabelled(html, "Yes"))).toBe(false);
  });

  it("disables both buttons while it runs", () => {
    const html = render({ busy: true });
    expect(isDisabled(buttonLabelled(html, "No"))).toBe(true);
    expect(isDisabled(buttonLabelled(html, "Yes"))).toBe(true);
  });
});

describe("DeleteTaskDialog: closing", () => {
  it("calls onClose when the window asks to close: Esc, a click outside and the X all do", () => {
    const onClose = vi.fn();
    render({ onClose });
    mocks.root!.onOpenChange!(false);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose when the window is asked to open", () => {
    const onClose = vi.fn();
    render({ onClose });
    mocks.root!.onOpenChange!(true);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("ignores a request to close while the delete runs", () => {
    const onClose = vi.fn();
    render({ busy: true, onClose });
    mocks.root!.onOpenChange!(false);
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does not call onConfirm by itself", () => {
    const onConfirm = vi.fn();
    render({ onConfirm });
    mocks.root!.onOpenChange!(false);
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("takes the opening focus from the dialog's default and puts it on No", () => {
    render();
    const preventDefault = vi.fn();
    mocks.content!.onOpenAutoFocus!({ preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
  });
});

describe("runTaskDelete", () => {
  const TASK = "a0000000-0000-4000-8000-000000000001";
  const NOW = "2026-11-11T15:30:00.000Z";

  function fakes(deleteTask: (input: { taskId: string; now: string }) => Promise<void>) {
    const calls: string[] = [];
    return {
      calls,
      args: {
        taskId: TASK,
        now: NOW,
        deleteTask: vi.fn(async (input: { taskId: string; now: string }) => {
          calls.push("delete");
          return deleteTask(input);
        }),
        close: vi.fn(() => {
          calls.push("close");
        }),
        showError: vi.fn((lines: string[]) => {
          calls.push(`error:${lines.join("|")}`);
        }),
      },
    };
  }

  it("deletes the task with the moment it was given, then closes the window", async () => {
    const { args, calls } = fakes(async () => {});
    await runTaskDelete(args);
    expect(args.deleteTask).toHaveBeenCalledTimes(1);
    expect(args.deleteTask).toHaveBeenCalledWith({ taskId: TASK, now: NOW });
    expect(calls).toEqual(["delete", "close"]);
    expect(args.showError).not.toHaveBeenCalled();
  });

  it('shows the toast "Could not delete the task" with the reason, and still closes', async () => {
    const { args, calls } = fakes(async () => {
      throw new Error("disk is full");
    });
    await runTaskDelete(args);
    expect(args.showError).toHaveBeenCalledWith(["Could not delete the task", "disk is full"]);
    expect(args.close).toHaveBeenCalledTimes(1);
    expect(calls[0]).toBe("delete");
    expect(calls).toContain("close");
  });

  it("gives a reason for a failure that is not an Error", async () => {
    const { args } = fakes(async () => {
      throw "the local database is closed";
    });
    await runTaskDelete(args);
    expect(args.showError).toHaveBeenCalledWith([
      "Could not delete the task",
      "the local database is closed",
    ]);
  });

  it("never throws, whatever the delete throws", async () => {
    for (const thrown of [new Error("x"), "x", null, undefined, { message: "x" }, 42]) {
      const { args } = fakes(async () => {
        throw thrown;
      });
      await expect(runTaskDelete(args)).resolves.toBeUndefined();
      expect(args.close).toHaveBeenCalledTimes(1);
    }
  });

  it("closes the window once, on success and on failure", async () => {
    const ok = fakes(async () => {});
    await runTaskDelete(ok.args);
    expect(ok.args.close).toHaveBeenCalledTimes(1);

    const bad = fakes(async () => {
      throw new Error("no");
    });
    await runTaskDelete(bad.args);
    expect(bad.args.close).toHaveBeenCalledTimes(1);
  });
});
