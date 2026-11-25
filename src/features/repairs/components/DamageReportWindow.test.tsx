import { describe, expect, it } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import type { DamageReportView } from "../utils/repairDetails";
import { DamageReportsContent } from "./DamageReportWindow";

// docs/specs/repairs-06-expanded-row.md §2.4 and §7 (D87, D91, D92). The content is rendered on the
// server (a Radix dialog needs a portal, which Vitest's node environment does not have): what is
// under test is which words, colours and links each card gets.

function view(over: Partial<DamageReportView> & { id: string }): DamageReportView {
  return {
    bleacherNumber: 26,
    day: "2026-09-17",
    createdBy: null,
    seat: "none",
    haul: "none",
    note: null,
    photos: [],
    resolvedDay: null,
    confirmations: [],
    fixedMark: null,
    ...over,
  };
}

const url = (path: string) => `https://storage.test/damage-report-photos/${path}`;

const render = (
  reports: DamageReportView[],
  over: { isLoading?: boolean; photoUrl?: (path: string) => string | null } = {},
) =>
  renderToStaticMarkup(
    <DamageReportsContent
      reports={reports}
      isLoading={over.isLoading ?? false}
      photoUrl={over.photoUrl ?? url}
    />,
  );

const text = (markup: string) =>
  markup
    .replace(/<[^>]*>/g, " ")
    .replace(/\s+/g, " ")
    .trim();

/** The markup of each card, in order. */
function cards(markup: string): string[] {
  const open = 'data-testid="damage-report-card"';
  return markup
    .split(open)
    .slice(1)
    .map((p) => open + p);
}

describe("DamageReportsContent cards", () => {
  it("draws one card per report, in the order given", () => {
    const markup = render([view({ id: "a" }), view({ id: "b", day: "2026-09-19" })]);
    const list = cards(markup);
    expect(list).toHaveLength(2);
    expect(text(list[0])).toContain("Reported 2026-09-17");
    expect(text(list[1])).toContain("Reported 2026-09-19");
  });

  it("draws the bleacher chip, #? for an unknown number", () => {
    const [known, unknown] = cards(
      render([view({ id: "a" }), view({ id: "b", bleacherNumber: null })]),
    );
    expect(text(known)).toContain("#26");
    expect(text(unknown)).toContain("#?");
  });

  it("writes who created the report, and nothing when nobody is known", () => {
    const [named, anonymous] = cards(
      render([view({ id: "a", createdBy: "Jane Doe" }), view({ id: "b" })]),
    );
    expect(text(named)).toContain("by Jane Doe");
    expect(text(anonymous)).not.toContain(" by ");
  });

  it("draws the state: Open in red, Resolved with its day in green", () => {
    const [open, resolved] = cards(
      render([view({ id: "a" }), view({ id: "b", resolvedDay: "2026-09-19" })]),
    );
    expect(text(open)).toContain("Open");
    expect(open).toContain("bg-red-100");
    expect(text(resolved)).toContain("Resolved 2026-09-19");
    expect(resolved).toContain("bg-green-100");
    expect(text(resolved)).not.toContain("Open");
  });

  it("writes Seat and Haul with the colour of the Damage Reports page", () => {
    const [card] = cards(render([view({ id: "a", seat: "minor", haul: "major" })]));
    expect(text(card)).toContain("Seat: minor");
    expect(text(card)).toContain("Haul: major");
    expect(card).toContain("text-yellow-700");
    expect(card).toContain("text-red-700");
    const [calm] = cards(render([view({ id: "b" })]));
    expect(text(calm)).toContain("Seat: none");
    expect(calm).toContain("text-green-700");
  });

  it("draws the note, keeping its line breaks, and no note block when there is none", () => {
    const [withNote] = cards(render([view({ id: "a", note: "Cracked weld\nat the tail" })]));
    expect(text(withNote)).toContain("Cracked weld at the tail");
    expect(withNote).toContain("whitespace-pre-wrap");
    const [without] = cards(render([view({ id: "b" })]));
    expect(without).not.toContain("whitespace-pre-wrap");
  });
});

describe("DamageReportsContent photos", () => {
  it("draws a thumbnail that links to the full picture in a new tab", () => {
    const [card] = cards(render([view({ id: "a", photos: [{ id: "p1", path: "r1/one.jpg" }] })]));
    expect(card).toContain(`href="${url("r1/one.jpg")}"`);
    expect(card).toContain('target="_blank"');
    expect(card).toContain('rel="noopener noreferrer"');
    expect(card).toContain(`src="${url("r1/one.jpg")}"`);
    expect(card).toContain("object-cover");
  });

  it("treats jpg, jpeg, png, heic, heif and webp as pictures, in any case", () => {
    const paths = ["a.jpg", "b.JPEG", "c.png", "d.heic", "e.heif", "f.WEBP"];
    const [card] = cards(
      render([view({ id: "a", photos: paths.map((p, i) => ({ id: `p${i}`, path: p })) })]),
    );
    expect(card.match(/<img /g)).toHaveLength(6);
  });

  it("shows the file name as a link for a path that is not a picture", () => {
    const [card] = cards(
      render([view({ id: "a", photos: [{ id: "p1", path: "r1/inspection-notes.pdf" }] })]),
    );
    expect(card).not.toContain("<img");
    expect(card).toContain(`href="${url("r1/inspection-notes.pdf")}"`);
    expect(text(card)).toContain("inspection-notes.pdf");
  });

  it("draws a grey placeholder until the storage client is ready", () => {
    const [card] = cards(
      render([view({ id: "a", photos: [{ id: "p1", path: "r1/one.jpg" }] })], {
        photoUrl: () => null,
      }),
    );
    expect(card).not.toContain("<img");
    expect(card).not.toContain("<a ");
    expect(card).toContain("animate-pulse");
  });

  it("draws no photo block when the report has no photo", () => {
    const [card] = cards(render([view({ id: "a" })]));
    expect(card).not.toContain("<img");
    expect(card).not.toContain("animate-pulse");
  });
});

describe("DamageReportsContent confirmations and the fixed mark", () => {
  it("writes Confirmed by N drivers with a line for each, and ' during an inspection'", () => {
    const [card] = cards(
      render([
        view({
          id: "a",
          confirmations: [
            { id: "k1", name: "Pat Lee", day: "2026-09-19", duringInspection: true },
            { id: "k2", name: "A driver", day: null, duringInspection: false },
          ],
        }),
      ]),
    );
    expect(text(card)).toContain("Confirmed by 2 drivers");
    expect(text(card)).toContain("Pat Lee · 2026-09-19 · during an inspection");
    expect(text(card)).toContain("A driver");
  });

  it("uses the singular for one driver and writes no block for none", () => {
    const [one] = cards(
      render([
        view({
          id: "a",
          confirmations: [{ id: "k", name: "Pat Lee", day: "2026-09-19", duringInspection: false }],
        }),
      ]),
    );
    expect(text(one)).toContain("Confirmed by 1 driver");
    expect(text(one)).not.toContain("1 drivers");
    const [none] = cards(render([view({ id: "b" })]));
    expect(text(none)).not.toContain("Confirmed by");
  });

  it("writes the fixed mark when there is one, and nothing otherwise", () => {
    const [fixed, plain] = cards(
      render([view({ id: "a", fixedMark: "Fixed by Sam Roe on 2026-09-18" }), view({ id: "b" })]),
    );
    expect(text(fixed)).toContain("Fixed by Sam Roe on 2026-09-18");
    expect(text(plain)).not.toContain("Fixed by");
  });
});

describe("DamageReportsContent states", () => {
  it("says Loading... while the queries answer, and draws no card", () => {
    const markup = render([], { isLoading: true });
    expect(text(markup)).toContain("Loading...");
    expect(cards(markup)).toHaveLength(0);
  });

  it("says the reports are not on the device when none is left", () => {
    const markup = render([]);
    expect(text(markup)).toContain("The damage reports are not on this device yet.");
    expect(text(render([view({ id: "a" })]))).not.toContain("not on this device");
  });

  it("is read-only: no button anywhere", () => {
    const markup = render([
      view({
        id: "a",
        note: "x",
        photos: [{ id: "p", path: "a.jpg" }],
        confirmations: [{ id: "k", name: "Pat", day: null, duringInspection: false }],
        fixedMark: "Fixed by a driver",
      }),
    ]);
    expect(markup).not.toContain("<button");
    expect(markup).not.toContain("<input");
    expect(markup).not.toContain("<textarea");
  });
});
