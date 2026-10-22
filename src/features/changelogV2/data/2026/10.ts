import type { MonthEntry } from "../../types";

export const october2026: MonthEntry = {
  year: 2026,
  month: 10,
  summary:
    "Website quote requests now arrive in the app as quotes, with a Fresh Inbound reminder until someone answers them. Quotes got a one-click status button and a tidier page, the scorecard now counts quotes on the day they were sent, and Work Trackers billing was fixed.",
  releases: [
    {
      version: "1.20.0",
      date: "2026-10-22",
      headline: "Mark a website request as Responded",
      sections: [
        {
          icon: "📥",
          title: "Mark a website request as Responded",
          where: "Quote page → Status button",
          body: "A quote that came from the website form and hasn't been sent yet shows a red Fresh Inbound button with a timer counting how long it has waited. Click it to choose Responded, Quote Sent, Quote Signed or Lost. Responded turns the button yellow, and you can go back to Fresh Inbound at any time.",
        },
        {
          icon: "🔔",
          title: "Answered requests leave the reminder",
          where: "Header and Quotes & Bookings → Inbound Leads",
          body: "Once a request is marked Responded it no longer counts in the red “New Leads!” reminder, nor in the Inbound Leads button and list.",
        },
      ],
    },
    {
      version: "1.19.2",
      date: "2026-10-22",
      headline: "“Invoice” only once a quote is booked",
      sections: [
        {
          icon: "🧾",
          title: "“Invoice” only once a quote is booked",
          where: "Quote page, public quote page, PDF and email",
          body: "Documents used to switch from Quote to Invoice as soon as the client signed. They now say Invoice only when the status is Booked, and Quote for every other status.",
        },
      ],
    },
    {
      version: "1.19.1",
      date: "2026-10-22",
      headline: "Scorecard counts quotes by the day they were sent",
      sections: [
        {
          icon: "📊",
          title: "Scorecard counts quotes by the day they were sent",
          where: "Scorecard",
          body: "Number of Quotes Sent and Value of Quotes Sent used to count a quote on the day it was created. They now count it on the day it was first sent, and that date never moves afterwards.",
          warning: "Quotes sent before this update are counted on the day they were created.",
        },
        {
          icon: "🔍",
          title: "A Quote Sent filter",
          where: "Quotes & Bookings → Filters",
          body: "The See Data buttons for these figures open the list filtered by the new Quote Sent date, so you see exactly the quotes behind the number.",
        },
      ],
    },
    {
      version: "1.19.0",
      date: "2026-10-20",
      headline: "Website quote requests arrive as quotes",
      video: "https://www.loom.com/share/4e9cb4d277334d9aad37e9d8b8605136",
      sections: [
        {
          icon: "🌐",
          title: "Website quote requests now arrive as quotes",
          where: "Quotes & Bookings",
          body: "When someone fills in the quote form on the website, a new quote is created with their contact, address, dates and seat count. A new Submission tab shows exactly what they typed.",
          bullets: [
            "Inbound Leads button next to the search box shows requests still waiting to be sent.",
            "A red “New Leads!” reminder with a running wait time sits at the top of every page.",
            "New Inbound and Zones filters in the Filters panel.",
          ],
        },
        {
          icon: "📨",
          title: "Choose who a quote is sent to",
          where: "Send To Client window",
          body: "Change the To, Cc and Bcc addresses, the subject and the attachments for that one send.",
        },
        {
          icon: "🚦",
          title: "Quote status button",
          where: "Quote page → Contract tab",
          body: "A coloured Status button beside the contract total lists only the changes that make sense. Marking a quote Lost asks for the reason.",
        },
      ],
    },
    {
      version: "1.18.0",
      date: "2026-10-13",
      headline: "Work Trackers billing fix and quick copy of venue addresses",
      sections: [
        {
          icon: "🧾",
          title: "A QuickBooks bill could land on the wrong driver",
          where: "Work Trackers → driver's status button → Create QuickBooks Bill",
          body: "After filtering the list, a bill could be marked Bill Created on a different driver. The list now keeps each driver's payment window with that driver.",
          warning:
            "If this already happened to you, delete that bill in QuickBooks and create it again from the right driver.",
        },
        {
          icon: "📋",
          title: "Copy a venue's address in one click",
          body: "A new copy button next to a venue's address puts it on your clipboard.",
        },
      ],
    },
    {
      version: "1.17.0",
      date: "2026-10-08",
      headline: "Tax stays up to date, and a one-click status button",
      sections: [
        {
          icon: "💲",
          title: "Editing a quote now keeps the tax up to date",
          where: "Quote form → editing an existing quote → Tax",
          body: "The tax follows the rate and the subtotal unless you type your own, which then stays put and is marked overridden.",
        },
        {
          icon: "🎯",
          title: "One-click status button",
          where: "Quotes & Bookings → top right",
          body: "Each click steps the list through All Statuses, Booked, Quoted, Lost and Draft.",
        },
      ],
    },
    {
      version: "1.16.0",
      date: "2026-10-07",
      headline: "A new Accountant role and a sortable quotes list",
      sections: [
        {
          icon: "🧾",
          title: "New role: Accountant",
          body: "Accountants handle payments and receivables. Account managers can no longer record payments.",
        },
        {
          icon: "🔎",
          title: "Sort, search and filters",
          where: "Quotes & Bookings list",
          body: "Sort by any column, search across the whole row, and narrow the list with the Filters panel.",
        },
      ],
    },
  ],
};
