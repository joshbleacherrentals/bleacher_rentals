import type { MonthEntry } from "../../types";

export const september2026: MonthEntry = {
  year: 2026,
  month: 9,
  summary:
    "Quotes became easier to get right: review the email before it goes out, payment schedules in percentages, and payment details that follow the sales office.",
  releases: [
    {
      version: "1.15.0",
      date: "2026-09-24",
      headline: "Review the email before it goes to the customer",
      sections: [
        {
          icon: "✉️",
          title: "Review the email before it goes to the customer",
          where: "Quotes → Send To Client",
          body: "You now see the email, as the customer will, before you send it.",
        },
        {
          icon: "💯",
          title: "Payment schedules are now percentages",
          body: "Split a contract into instalments by percentage instead of amounts.",
        },
        {
          icon: "🏦",
          title: "Payment details match the sales office",
          where: "Quote",
          body: "The cheque and transfer details shown on a quote now come from the quote's sales office.",
        },
      ],
    },
  ],
};
