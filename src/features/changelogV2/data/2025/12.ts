import type { MonthEntry } from "../../types";

// SAMPLE CONTENT: made up to show a second year in the layout, not real release notes.
export const december2025: MonthEntry = {
  year: 2025,
  month: 12,
  summary:
    "Sample: a quieter month of polish. Driver calendars got easier to read and a few Dashboard annoyances were fixed.",
  releases: [
    {
      version: "1.9.1",
      date: "2025-12-16",
      headline: "Easier-to-read driver calendar",
      sections: [
        {
          icon: "📅",
          title: "Easier-to-read driver calendar",
          where: "Driver Calendar",
          body: "Sample entry. Days with several jobs now show each driver on its own line.",
        },
      ],
    },
    {
      version: "1.9.0",
      date: "2025-12-02",
      headline: "Dashboard filters remember your choices",
      sections: [
        {
          icon: "🗂️",
          title: "Dashboard filters remember your choices",
          where: "Dashboard → Filters",
          body: "Sample entry. The filters you pick are still there the next time you open the Dashboard.",
        },
      ],
    },
  ],
};
