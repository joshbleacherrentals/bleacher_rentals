import { createRequire } from "node:module";
import path from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Radix keeps the list of open layers in a React context created at the top of its module, so every
 * installed copy of `@radix-ui/react-dismissable-layer` (and of `react-focus-scope`) has a list of its
 * own. When `@radix-ui/react-alert-dialog` brings its own copy of `react-dialog`, a Dialog and an
 * AlertDialog do not know about each other: a click inside the AlertDialog counts as a click outside
 * the Dialog and closes it, and the two copies restore `pointer-events` on <body> in the wrong order,
 * which leaves the page frozen. This showed as the Delete of a repair and of a service doing nothing
 * (2026-11-24). The two must resolve to one copy.
 */
const fromRoot = createRequire(path.join(process.cwd(), "package.json"));
const resolveFrom = (file: string, request: string) => createRequire(file).resolve(request);

describe("one copy of the Radix layer code", () => {
  const topDialog = fromRoot.resolve("@radix-ui/react-dialog");
  const alertDialogEntry = fromRoot.resolve("@radix-ui/react-alert-dialog");

  it("the AlertDialog is built on the same Dialog as the app's Dialog", () => {
    expect(resolveFrom(alertDialogEntry, "@radix-ui/react-dialog")).toBe(topDialog);
  });

  it.each(["@radix-ui/react-dismissable-layer", "@radix-ui/react-focus-scope"])(
    "the Dialog the AlertDialog uses shares %s with the app's Dialog",
    (request) => {
      const alertDialog = resolveFrom(alertDialogEntry, "@radix-ui/react-dialog");
      expect(resolveFrom(alertDialog, request)).toBe(resolveFrom(topDialog, request));
    },
  );
});
