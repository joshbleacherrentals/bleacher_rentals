import type { WebRole } from "./logic/determineAccess";

export type PermissionLevel = "full" | "read" | "custom" | "none";

export type PermissionAccess = {
  level: PermissionLevel;
  note?: string;
};

export type PermissionEntry = {
  label: string;
  description?: string;
  category: string;
  roles: Record<WebRole, PermissionAccess>;
};

export const ROLE_LABELS: Record<WebRole, string> = {
  admin: "Administrator",
  account_manager: "Account Manager",
  driver: "Driver",
  maintainer: "Maintainer",
  viewer: "Viewer",
  developer: "Developer",
};

export const ROLE_DESCRIPTIONS: Record<WebRole, string> = {
  admin: "Full access to all features, settings, and team management.",
  account_manager:
    "Manages their own assigned bleachers, drivers, and events. Cannot delete or modify company-wide data, other managers' records, or anything outside their own scope. A low-risk role to add without worrying about unintended changes to shared data.",
  developer: "Access to the product roadmap only.",
  viewer: "Read-only access to operational data. Cannot create, edit, or delete anything.",
  driver:
    "Access to the mobile driver app only. Cannot access the web dashboard at all, and has no permissions related to the web dashboard features.",
  maintainer:
    "Owns the annual inspection of the fleet. Sees the Annual Inspections queue and can open a bleacher to read its inspection history — nothing else on the dashboard. A safe role to hand to whoever keeps the inspections up to date, without giving them anything to break.",
};

export const ROLE_ORDER: WebRole[] = [
  "admin",
  "account_manager",
  "maintainer",
  "driver",
  "viewer",
  "developer",
];

export const DEFAULT_NOTES: Record<PermissionLevel, string> = {
  full: "This role has full access — they can view, create, edit, and delete records.",
  read: "This role has read-only access — they can view data but cannot make any changes.",
  custom: "This role has custom access — see details below.",
  none: "This role has no access — the page or data is completely hidden from them.",
};

const full = (note?: string): PermissionAccess => ({ level: "full", note });
const read = (note?: string): PermissionAccess => ({ level: "read", note });
const custom = (note: string): PermissionAccess => ({ level: "custom", note });
const none = (note?: string): PermissionAccess => ({ level: "none", note });

export const PERMISSIONS: PermissionEntry[] = [
  // Day to Day Operations
  {
    label: "Events",
    description: "This applies to the Dashboard and the Quotes & Bookings page.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "should be able to create, update, delete, and edit any events, regardless of who event is assigned to. This includes the ability to reassign events between account managers.",
      ),
      account_manager: custom(
        "Account managers can freely create events, but can only edit or delete events that were created by themselves. They are able to view All events regardless of the event owner.",
      ),
      developer: none(
        "Unable to even access the pages where they can see events, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "This user will be able to see all the event and every detail but not able to create, edit, or delete any events.",
      ),
      driver: custom(
        "Can file a ticket to the developers from the mobile app, and edit their own for a short window afterwards. Has no access to the rest of the roadmap — they cannot see, edit or comment on anyone else's work.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "QuickBooks Invoice Flag",
    description:
      "The 'QuickBooks Invoice' checkbox on the Billing tab of a quote or booking, which records by hand that the event has been invoiced in QuickBooks. It is bookkeeping only — it does not push anything to QuickBooks.",
    category: "Day to Day Operations",
    roles: {
      admin: full("Can tick or untick the flag on any quote or booking."),
      account_manager: full(
        "Can tick or untick the flag on any quote or booking, including ones they did not create. Bookkeeping is not the quote owner's job — whoever entered the invoice into QuickBooks is the one who marks it.",
      ),
      developer: none(
        "Unable to even access the pages where they can see quotes, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read("Can see whether the flag is set, but the checkbox is disabled."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Payment History",
    description:
      "The payments and balances on the Billing tab of a quote or booking. Amounts come from what Stripe actually collected, so a partial payment shows as partial rather than closing the whole installment. Clicking a row opens the full record of that payment — every installment it was applied to, the reference and the notes.",
    category: "Day to Day Operations",
    roles: {
      admin: read(
        "Can see every payment on any quote — amount, payer, method and the Stripe receipt. Payments from Stripe appear on their own once the client pays; anything paid another way is entered by hand (see Record a Payment).",
      ),
      account_manager: read(
        "Exactly the same view as an administrator, on every quote, including ones they did not create.",
      ),
      developer: none(
        "Unable to even access the pages where they can see quotes, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "Can see payments and balances, and open any payment to read it in full, but cannot change anything.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Record a Payment",
    description:
      "Entering a payment that did not come through Stripe — a check, an ACH transfer, or a card run by hand on a terminal — from the Billing tab of a quote or booking. A recorded payment can never be edited or deleted; a mistake is corrected by recording the same amount as a negative, so both entries stay on the record.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can record a card, ACH or check payment on any quote or booking, including a negative amount for a refund, a bounced check or a correction. Recording a refund here does not send money back through Stripe — that is done in Stripe.",
      ),
      account_manager: custom(
        "A lead account manager can do all of that on any quote or booking, including ones they did not create. Everyone else can only do it on the quotes they created — on other people's quotes the button is disabled. The same rule as every other edit on the page.",
      ),
      developer: none(
        "Unable to even access the pages where they can see quotes, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: none(
        "No. Reading the payment history is a separate thing, and they can still do that.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Event Chat",
    description:
      "The internal chat on a quote, booking or event — the conversation staff have among themselves. Clients never see it. The person who owns the event is added to its chat automatically when the event is created and if the event changes hands; anyone else joins with the Join button. Someone who leaves a chat stays out until they rejoin, including the owner.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can read every event chat, post, join or leave, and delete or edit any message, including other people's.",
      ),
      account_manager: custom(
        "Can read every event chat, post in it, and join or leave. Can edit or delete only their own messages. Can also remove someone else from a chat they are themselves part of.",
      ),
      developer: none(
        "Unable to even access the pages where the chat lives, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read("Can read event chats and who is in them, but cannot post, join or leave."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Dashboard Cells",
    description: "This applies to the Dashboard page.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "should be able to create, update, delete, and edit any cells, regardless of who is assigned to bleacher. ",
      ),
      account_manager: custom(
        "Account managers can freely create notes and events on cells, but can edit or delete only those cells that were created in the bleacher field assigned to them. They are able to view All cells regardless of the event owner.",
      ),
      developer: none(
        "Unable to even access the pages where they can see cells, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "This user will be able to see all the cells and every detail but not able to create, edit, or delete any cells.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Companies & Contacts",
    description:
      "This applies to the Companies & Contacts page, and to the contact and company forms reached from the quote builder and the work tracker.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can create, edit and delete any company or contact, including setting the Quote Language that decides which language that contact's quotes are sent in.",
      ),
      account_manager: full(
        "Contacts and companies are a shared address book, not owned records — account managers can create and edit any of them, including the Quote Language, because they are the ones speaking to the client and sending the quote.",
      ),
      developer: none(
        "Unable to even access the page, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "This user can see companies and contacts and every detail, but cannot create, edit or delete any of them. Enforced in the database by row-level security, so the block holds even though the page still shows the buttons — a write appears to succeed locally and is then rejected by the server.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Work Trackers",

    description: "This applies to the Work Trackers Page and the Dashboard.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "should be able to create, update, delete, and edit any work trackers, regardless of who work tracker is assigned to. This includes the ability to reassign work trackers between drivers.",
      ),
      account_manager: custom(
        "Account managers should be able to create work trackers only on bleachers that they own. They should be able to view all work trackers.",
      ),
      developer: none(
        "Unable to even access the pages where they can see work trackers, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "This user will be able to see all the work trackers and every detail but not able to create, edit, or delete any work trackers.",
      ),
      driver: custom(
        "(in the mobile app only) Drivers only have access to work trackers that have been released and are assigned to them. They only have the ability to change the status and submit inspection forms to this work tracker. They cannot delete a work tracker or change any other information.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Mobile Driver App Access",
    description:
      "This only applies to being able to maintain data in the mobile app on the iOS and Android app store.",
    category: "Day to Day Operations",
    roles: {
      admin: none("Must be a driver to have access to the mobile app."),
      account_manager: none("Must be a driver to have access to the mobile app."),
      developer: none("Must be a driver to have access to the mobile app."),
      viewer: none("Must be a driver to have access to the mobile app."),
      driver: full(
        "Drivers have full access to their profile in the mobile app. They can update their driver information, vehicle information, and legal information. They can also set their availability and accept and complete work trackers.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Repairs & Maintenance",
    description:
      "Creating and managing maintenance events for taking bleachers in for repair or scheduled maintenance. This applies to the Repairs page and the Dashboard.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can create, edit, and delete any repair or maintenance event regardless of who created it. Can reassign maintenance events between account managers.",
      ),
      account_manager: custom(
        "Can create new repair and maintenance events, but can only edit or delete ones they created themselves. Can view all maintenance events regardless of the creator.",
      ),
      developer: none(
        "Developers do not have access to repairs or maintenance data. This role is limited to the product roadmap.",
      ),
      viewer: read(
        "Can view all repair and maintenance events and their details but cannot create, edit, or delete any.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Damage Reports",
    description:
      "Reporting and tracking damage to bleachers. Damage reports can be created on the web dashboard or through the Driver Mobile App.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can create, view, edit, and delete any damage report regardless of who created it.",
      ),
      account_manager: custom(
        "Can create new damage reports and view all existing ones. Can only edit or delete damage reports they created themselves.",
      ),
      developer: none(
        "Developers do not have access to damage report data. This role is limited to the product roadmap.",
      ),
      viewer: read(
        "Can view all damage reports and their details but cannot create, edit, or delete any.",
      ),
      driver: custom(
        "Can create damage reports through the mobile app when they notice damage to a bleacher. Can view their own submitted reports but cannot edit or delete them once submitted.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Annual Inspections",
    description:
      "The annual inspection due date on every bleacher, the certificate PDF that goes with it, and the Annual Inspections queue under Quality Assurance. Bleachers are flagged yellow 30 days before the date, red 7 days before, and red again once the date has passed.",
    category: "Day to Day Operations",
    roles: {
      admin: full(
        "Can record an inspection on any bleacher, correct an earlier record, upload or replace the certificate, and edit the notes. Gets no unread counter in the sidebar and no highlight on the queue — those belong to the Maintainer, who is the one being chased about the dates.",
      ),
      account_manager: custom(
        "Account managers do not have the Annual Inspections page — it belongs to the Maintainer role. They still see the annual inspection of a bleacher on the bleacher itself, in the Assets page, and can record one from there.",
      ),
      developer: none(
        "Unable to even access the pages where inspections are shown; developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "Can open the queue and read every inspection, its notes and its certificate, but cannot record or change one. Reads it without being notified: no counter in the sidebar and no highlight on the rows.",
      ),
      driver: none(
        "Drivers only have access to the Driver Mobile App, which has no screen for annual inspections. The pre-trip and post-trip inspections they do fill in are a separate thing entirely.",
      ),
      maintainer: full(
        "This is the role's whole job. Can record an inspection on any bleacher, correct an earlier record, upload or replace the certificate, and edit the notes. The only role that is notified: a counter in the sidebar on Annual Inspections, and a highlight on the bleachers that crossed a date since the last visit. Opening the page marks them all read, so the next visit highlights only what is new since then.",
      ),
    },
  },

  // Configuration
  {
    label: "Bleachers",
    description: "This applies to the Assets page.",
    category: "Configuration",
    roles: {
      admin: full("Able to create, update, delete, and edit all bleachers in the assets page."),
      account_manager: read(
        "Account managers should have view only access to the assets page and should not be able to make changes to the bleachers. they should not be able to create, delete or update. only read.",
      ),
      developer: none(
        "Unable to even access the pages where they can see bleachers, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: read(
        "This user will be able to see all the bleachers and every detail but not able to create, edit, or delete any bleachers.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: read(
        "Can open a bleacher to reach its annual inspection history, but cannot change anything about the bleacher itself.",
      ),
    },
  },
  {
    label: "Quickbooks Connections",
    description: "This applies to the Quickbooks page.",
    category: "Configuration",
    roles: {
      admin: full(
        "Able to create, update, delete, and edit all Quickbooks connections in the Quickbooks page.",
      ),
      account_manager: none("Account managers can't even see this page even on sidebar"),
      developer: none(
        "Unable to even access the pages where they can see Quickbooks connections, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: none("Viewers do not have access to the web configuration pages."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Work Tracker Types",
    description:
      "This applies to the Work Tracker Types page under Configuration, where each of the 3 fixed work tracker types (Trip, Repair / Maintenance, Site Visit / Cleaning / Other) is assigned a QuickBooks account per connection. The 3 types themselves cannot be renamed, added, or removed — only their QuickBooks account assignment is editable, here and nowhere else.",
    category: "Configuration",
    roles: {
      admin: full(
        "Able to assign or change the QuickBooks account for each of the 3 work tracker types, per QuickBooks connection.",
      ),
      account_manager: none("Account managers can't even see this page even on sidebar"),
      developer: none(
        "Unable to even access the pages where they can see work tracker types, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: none("Viewers do not have access to the web configuration pages."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Manage Inspection Form",
    description:
      "The ability to create and edit the inspection form template that drivers fill out during pickup and drop-off. This applies to the Inspection Form page under Configuration.",
    category: "Configuration",
    roles: {
      admin: full(
        "Can create, reorder, edit, and delete inspection form questions. Full control over what drivers see when completing an inspection.",
      ),
      account_manager: none("Account managers can't even see this page even on sidebar"),
      developer: none(
        "Developers do not have access to the Inspection Form page. This role is limited to the product roadmap.",
      ),
      viewer: none("Viewers do not have access to the web configuration pages"),
      driver: none(
        "Drivers do not have access to the web configuration pages. They interact with the inspection form only when completing inspections in the mobile app.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Complete Inspections",
    description:
      "The ability to fill out and submit inspection forms when picking up or dropping off a bleacher. This happens in the Driver Mobile App.",
    category: "Day to Day Operations",
    roles: {
      admin: read(
        "Admins can view all completed inspections on the web dashboard but do not fill out inspections themselves.",
      ),
      account_manager: read(
        "Account managers can view completed inspections for drivers assigned to them but do not fill out inspections themselves.",
      ),
      developer: none(
        "Developers do not have access to inspection data. This role is limited to the product roadmap.",
      ),
      viewer: read(
        "Viewers can see all completed inspections and their details but cannot submit or modify them.",
      ),
      driver: custom(
        "Drivers submit inspections through the mobile app when picking up or dropping off a bleacher. They can only submit inspections for work trackers assigned to them. Once submitted, an inspection cannot be edited or deleted by the driver.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Zone Manager",
    category: "Configuration",
    roles: {
      admin: full("Able to create, update, delete, and edit all zones in the Zone Manager page."),
      account_manager: none("Account managers can't see zones page."),
      developer: none(
        "Unable to even access the pages where they can see zones, and developer is only meant to work on the developer roadmap.",
      ),
      viewer: none("Viewers do not have access to the web configuration pages."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },

  // Team Management
  {
    label: "Invite Team Members",
    description: "The ability to add new users to the system. This applies to the Team page.",
    category: "Team Management",
    roles: {
      admin: full("Can invite any type of team member, including other admins."),
      account_manager: custom(
        "Can invite new team members, but cannot assign them the Admin role. Can only invite drivers and other standard roles.",
      ),
      developer: none(
        "Developers do not have access to the Team page. This role is limited to the product roadmap.",
      ),
      viewer: none(
        "Viewers cannot invite team members. They have read-only access across the platform.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Edit Team Members",
    description:
      "The ability to view and modify team member profiles, role assignments, and driver assignments. This applies to the Team page.",
    category: "Team Management",
    roles: {
      admin: full(
        "Can view and edit all information for every team member, including changing roles and reassigning drivers between managers.",
      ),
      account_manager: custom(
        "Can view every team member's profile, but can only edit driver data for drivers assigned to themselves. Can assign an unassigned driver to themselves, but cannot reassign a driver who is already assigned to another manager.",
      ),
      developer: none(
        "Developers do not have access to the Team page. This role is limited to the product roadmap.",
      ),
      viewer: read("Can view all team member profiles and details, but cannot make any changes."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Deactivate Team Members",
    description:
      "The ability to deactivate user accounts, removing their access to the system. This applies to the Team page.",
    category: "Team Management",
    roles: {
      admin: full(
        "Only admins can deactivate team members. This is an admin-exclusive action to prevent accidental loss of access.",
      ),
      account_manager: none(
        "Account managers cannot deactivate team members. Only admins have this ability.",
      ),
      developer: none(
        "Developers do not have access to the Team page. This role is limited to the product roadmap.",
      ),
      viewer: none(
        "Viewers cannot deactivate team members. They have read-only access across the platform.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },

  // Scorecards
  {
    label: "Sales Scorecard",
    description:
      "View account manager performance numbers such as booked revenue, margins, and other sales metrics. This applies to the Sales Scorecard page.",
    category: "Scorecards",
    roles: {
      admin: full("Can view all account manager sales numbers and performance metrics."),
      account_manager: read(
        "Can view all account manager sales numbers, including their own and other managers' performance.",
      ),
      developer: none(
        "Developers do not have access to scorecard data. This role is limited to the product roadmap.",
      ),
      viewer: read("Can view all sales scorecard data but cannot make any changes."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Driver Scorecard",
    description:
      "View driver performance metrics such as on-time rates, inspection completion, and other driver stats. This applies to the Driver Scorecard page.",
    category: "Scorecards",
    roles: {
      admin: full("Can view all driver performance metrics and stats."),
      account_manager: read("Can view driver scorecard data for all drivers."),
      developer: none(
        "Developers do not have access to scorecard data. This role is limited to the product roadmap.",
      ),
      viewer: read("Can view all driver scorecard data but cannot make any changes."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },

  // Development Roadmap
  {
    label: "Quarters",
    description:
      "Top-level time periods used to organize sprints and plan roadmap work. This applies to the Roadmap page.",
    category: "Development Roadmap",
    roles: {
      admin: full("Can create, edit, and delete quarters to structure the roadmap timeline."),
      account_manager: none("Account managers do not have access to roadmap planning."),
      developer: read(
        "Can view quarters to understand the roadmap timeline, but cannot create or modify them.",
      ),
      viewer: none("Viewers do not have access to the development roadmap."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Sprints",
    description:
      "Time-boxed development cycles within a quarter. Sprints contain tickets that developers work on. This applies to the Roadmap page.",
    category: "Development Roadmap",
    roles: {
      admin: full(
        "Can create, edit, and delete sprints. Full control over sprint planning and organization.",
      ),
      account_manager: none("Account managers do not have access to roadmap planning."),
      developer: read(
        "Can view sprints and the tickets within them, but cannot create, edit, or delete sprints themselves.",
      ),
      viewer: none("Viewers do not have access to the development roadmap."),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Driver Satisfaction",
    description:
      "This applies to the Driver Satisfaction page, and to the survey drivers answer in the mobile app.",
    category: "Development Roadmap",
    roles: {
      admin: full(
        "Sees every response, and can create surveys and questions as well as correct a submitted response.",
      ),
      account_manager: read(
        "Can open the page and read every driver's responses and scores, but cannot change a survey, a question or a response.",
      ),
      developer: custom(
        "Creates and edits the surveys and their questions, and reads every response. Cannot alter a response a driver has submitted.",
      ),
      viewer: read(
        "Can open the page and read every driver's responses and scores, but cannot change anything.",
      ),
      driver: custom(
        "(in the mobile app only) Answers the survey, and can see their own past answers. Cannot see any other driver's responses, and has no access to the web page.",
      ),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
  {
    label: "Backlog / Tickets",
    description:
      "Individual work items that can live in the backlog or be assigned to a sprint. Tickets are visible on the Roadmap page and can be moved between the backlog and sprints.",
    category: "Development Roadmap",
    roles: {
      admin: full(
        "Can create, edit, and delete any ticket. Can move tickets between the backlog and sprints.",
      ),
      account_manager: full(
        "Can create, edit, and view tickets. Useful for submitting feature requests or bug reports directly into the backlog.",
      ),
      developer: full(
        "Can create, edit, and view tickets. Can move tickets between the backlog and sprints, and update ticket status as work progresses.",
      ),
      viewer: read(
        "Can view all tickets in the backlog and sprints but cannot create, edit, or move them.",
      ),
      driver: none("Drivers only have access to the Driver Mobile App."),
      maintainer: none(
        "Maintainers work on annual inspections and nothing else. Everything else on the web dashboard is hidden from them entirely.",
      ),
    },
  },
];

export const CATEGORIES = [...new Set(PERMISSIONS.map((p) => p.category))];
