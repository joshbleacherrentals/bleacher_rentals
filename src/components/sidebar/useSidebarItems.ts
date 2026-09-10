import {
  LayoutDashboard,
  FileText,
  Users,
  Truck,
  ClipboardList,
  BarChart3,
  Trophy,
  CalendarDays,
  ClipboardCheck,
  MapPinned,
  ShieldAlert,
  ShieldCheck,
  BookText,
  Settings,
  Building2,
  ScrollText,
  CreditCard,
  DollarSign,
  BookUser,
  Warehouse,
  MessageSquare,
  Mails,
  Sparkles,
  Layers,
} from "lucide-react";
import { QuickBooksIcon } from "@/components/Icons";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";

type SidebarButtonItem = {
  type: "button";
  key: string;
  label: string;
  href: string;
  icon: React.ComponentType<any>;
};

export type SidebarDropdownChild = {
  label: string;
  href: string;
  /**
   * Which roles may see this child. Absent means everyone who can see the
   * parent — the case for every child that predates the maintainer role.
   */
  roles?: WebRole[];
};

type SidebarDropdownItem = {
  type: "dropdown";
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  children: SidebarDropdownChild[];
};

type SidebarSectionItem = {
  type: "section";
  key: string;
  label: string;
  icon: React.ComponentType<any>;
  children: SidebarItemConfig[];
};

export type SidebarItemConfig = SidebarButtonItem | SidebarDropdownItem | SidebarSectionItem;

const ALL_ITEMS: SidebarItemConfig[] = [
  {
    type: "button",
    key: "dashboard",
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
  },
  {
    type: "button",
    key: "quotes-bookings",
    label: "Quotes & Bookings",
    href: "/quotes-bookings",
    icon: FileText,
  },
  {
    type: "button",
    key: "team",
    label: "Team",
    href: "/team",
    icon: Users,
  },
  {
    type: "button",
    key: "assets",
    label: "Assets",
    href: "/assets",
    icon: Truck,
  },
  {
    type: "dropdown",
    key: "quality-assurance",
    label: "Quality Assurance",
    icon: ShieldAlert,
    children: [
      // A maintainer owns the annual inspections and nothing else here; an
      // account manager owns everything here except the annual inspections.
      // Without per-child roles the dropdown is all-or-nothing, and both would
      // be shown links that bounce them straight back out.
      {
        label: "Damage Reports",
        href: "/damage-reports",
        roles: ["admin", "account_manager", "viewer"],
      },
      { label: "Inspections", href: "/inspections", roles: ["admin", "account_manager", "viewer"] },
      {
        label: "Annual Inspections",
        href: "/annual-inspections",
        roles: ["admin", "viewer", "maintainer"],
      },
      { label: "Repairs", href: "/repairs", roles: ["admin", "account_manager", "viewer"] },
    ],
  },
  {
    type: "button",
    key: "work-trackers",
    label: "Work Trackers",
    href: "/work-trackers",
    icon: ClipboardList,
  },
  {
    type: "dropdown",
    key: "scorecard",
    label: "Scorecard",
    icon: BarChart3,
    children: [
      { label: "Sales Scorecard", href: "/scorecard" },
      { label: "Driver Scorecard", href: "/driver-scorecard" },
      { label: "Driver Satisfaction", href: "/driver-satisfaction" },
    ],
  },
  {
    type: "button",
    key: "leaderboard",
    label: "Leaderboard",
    href: "/leaderboard",
    icon: Trophy,
  },
  {
    type: "button",
    key: "driver-calendar",
    label: "Driver Calendar",
    href: "/driver-calendar",
    icon: CalendarDays,
  },
  {
    type: "dropdown",
    key: "messages",
    label: "Messages",
    icon: MessageSquare,
    children: [
      { label: "Internal", href: "/messages/internal" },
      { label: "External", href: "/messages/external" },
    ],
  },
  {
    type: "button",
    key: "companies-contacts",
    label: "Companies & Contacts",
    href: "/companies-contacts",
    icon: BookUser,
  },
  {
    type: "section",
    key: "configuration",
    label: "Configuration",
    icon: Settings,
    children: [
      {
        type: "button",
        key: "zones",
        label: "Zone Manager",
        href: "/zones",
        icon: MapPinned,
      },
      {
        type: "button",
        key: "inspection-questions",
        label: "Inspection Form",
        href: "/inspection-questions",
        icon: ClipboardCheck,
      },
      {
        type: "button",
        key: "quickbooks",
        label: "QuickBooks",
        href: "/quickbooks",
        icon: QuickBooksIcon,
      },
      {
        type: "button",
        key: "work-tracker-types",
        label: "Work Tracker Types",
        href: "/work-tracker-types",
        icon: Layers,
      },
      {
        type: "button",
        key: "stripe-connections",
        label: "Stripe",
        href: "/stripe-connections",
        icon: CreditCard,
      },
      {
        type: "button",
        key: "pricing-matrix",
        label: "Pricing Matrix",
        href: "/pricing-matrix",
        icon: DollarSign,
      },
      {
        type: "button",
        key: "terms-and-conditions",
        label: "Terms & Conditions",
        href: "/terms-and-conditions",
        icon: ScrollText,
      },
      {
        type: "button",
        key: "sales-offices",
        label: "Sales Offices",
        href: "/sales-offices",
        icon: Building2,
      },
      {
        type: "button",
        key: "storage-locations",
        label: "Storage Locations",
        href: "/storage-locations",
        icon: Warehouse,
      },
    ],
  },

  {
    type: "section",
    key: "documentation",
    label: "Documentation",
    icon: BookText,
    children: [
      {
        type: "button",
        key: "permissions",
        label: "Role Permissions",
        href: "/permissions",
        icon: ShieldCheck,
      },
      {
        type: "button",
        key: "changelog",
        label: "What's New",
        href: "/changelog",
        icon: Sparkles,
      },
    ],
  },
];

const ROLE_SIDEBAR_KEYS: Record<WebRole, string[]> = {
  admin: [
    "dashboard",
    "quotes-bookings",
    "messages",
    "companies-contacts",
    "sales-offices",
    "team",
    "assets",
    "quality-assurance",
    "work-trackers",
    "scorecard",
    "leaderboard",
    "driver-calendar",
    "configuration",
    "documentation",
  ],
  account_manager: [
    "dashboard",
    "quotes-bookings",
    "messages",
    "companies-contacts",
    "sales-offices",
    "team",
    "assets",
    "quality-assurance",
    "work-trackers",
    "scorecard",
    "leaderboard",
    "driver-calendar",
    "documentation",
  ],
  developer: ["roadmap"],
  viewer: [
    "dashboard",
    "quotes-bookings",
    "sales-offices",
    "team",
    "assets",
    "quality-assurance",
    "work-trackers",
    "scorecard",
    "leaderboard",
    "driver-calendar",
    "documentation",
  ],
  driver: [],
  maintainer: ["quality-assurance", "documentation", "assets"],
};

export function useSidebarItems(roles: WebRole[]): SidebarItemConfig[] {
  const keySet = new Set<string>();
  for (const role of roles) {
    for (const key of ROLE_SIDEBAR_KEYS[role]) {
      keySet.add(key);
    }
  }

  const visible = ALL_ITEMS.filter((item) => keySet.has(item.key));

  return visible.flatMap((item): SidebarItemConfig[] => {
    if (item.type !== "dropdown") return [item];

    const children = item.children.filter(
      (child) => !child.roles || child.roles.some((role) => roles.includes(role)),
    );

    // A dropdown whose every child was filtered out is a menu that opens onto
    // nothing, so it does not belong in the sidebar at all.
    if (children.length === 0) return [];

    return [{ ...item, children }];
  });
}
