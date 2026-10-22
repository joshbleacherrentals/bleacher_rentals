import type { MonthEntry } from "../../types";

// SAMPLE CONTENT: made up to show a second year in the layout, not real release notes.
export const november2025: MonthEntry = {
  year: 2025,
  month: 11,
  summary:
    "Sample: the month work trackers and the leaderboard got their first big update, with weekly totals and clearer driver pay.",
  releases: [
    {
      version: "1.8.0",
      date: "2025-11-11",
      headline: "Weekly totals on Work Trackers",
      sections: [
        {
          icon: "🚛",
          title: "Weekly totals on Work Trackers",
          where: "Work Trackers",
          body: "Sample entry. Each week now shows what every driver is owed at the top of the list.",
          bullets: ["Totals update as you edit a tracker.", "Unpaid weeks are marked in red."],
        },
        {
          icon: "🏆",
          title: "A weekly leaderboard",
          where: "Leaderboard",
          body: "Sample entry. See who booked the most this week and how that compares with last week.",
        },
      ],
    },
  ],
};
