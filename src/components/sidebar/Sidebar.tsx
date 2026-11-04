"use client";
import { useState } from "react";
import { usePathname } from "next/navigation";
import { ChevronDown } from "lucide-react";
import { SideNavButton } from "./SideNavButton";
import { SideNavDropdown } from "./SideNavDropdown";
import { useUserAccess } from "@/features/userAccess/client";
import { useSidebarItems, type SidebarItemConfig } from "./useSidebarItems";
import { useHasUnreadChangelog } from "@/features/changelog/hooks/useHasUnreadChangelog";
import { useUnseenInspectionCount } from "@/features/annualInspections/db/annualInspections";
import { useAttentionCount } from "@/features/workTrackers/db/attentionTrackers";
import { useInvoiceAlerts } from "@/features/quotesAndBookings/hooks/useInvoiceAlerts";

const SideBar = () => {
  const access = useUserAccess();
  const roles = access.status === "active" ? access.roles : [];
  const items = useSidebarItems(roles);
  const pathname = usePathname();
  const hasUnreadChangelog = useHasUnreadChangelog();
  // A count, not the rows: the shell re-renders on every navigation, and
  // subscribing it to the queue itself would redraw the sidebar whenever any
  // inspection anywhere changed. The hook answers 0 for anyone who is not a
  // maintainer, so who is nagged is decided in one place, not here.
  const unseenInspections = useUnseenInspectionCount();
  const badges = { "/annual-inspections": unseenInspections };
  // Trackers the drivers in my zones declined, abandoned or swapped a bleacher on, for all time. The
  // hook answers 0 to anyone who is not an active account manager, so an admin
  // without zones is not nagged about work that is nobody's to re-cover.
  const attentionTrackers = useAttentionCount();
  // Quotes whose QuickBooks invoice no longer matches the quote, for accountants only: the hook answers
  // 0 to everyone else, and asks everyone else a query that matches no row (spec 11).
  const { count: invoiceAlerts } = useInvoiceAlerts();

  return (
    <div
      className="w-56 shrink-0 bg-gray-100 border-r border-gray-200 flex flex-col h-full overflow-x-hidden"
      data-testid="sidebar"
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden pt-2">
        {items.map((item) =>
          renderItem(item, pathname, hasUnreadChangelog, badges, attentionTrackers, invoiceAlerts),
        )}
      </nav>
    </div>
  );
};

const SideNavSection = ({
  item,
  pathname,
  children,
}: {
  item: Extract<SidebarItemConfig, { type: "section" }>;
  pathname: string;
  children: React.ReactNode;
}) => {
  const hasActiveChild = item.children.some(
    (child) => child.type === "button" && pathname.startsWith(child.href),
  );

  const [isOpen, setIsOpen] = useState(hasActiveChild);
  const Icon = item.icon;

  return (
    <div className="mt-2 border-t border-gray-200 pt-2">
      <button
        onClick={() => setIsOpen((o) => !o)}
        className="flex items-center min-w-0 px-4 py-1 m-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 cursor-pointer"
      >
        <Icon className="h-3.5 w-3.5 mr-2 shrink-0" />
        <span className="truncate">{item.label}</span>
        <ChevronDown
          className={`h-3.5 w-3.5 ml-auto shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
        />
      </button>
      {isOpen && <div>{children}</div>}
    </div>
  );
};

/** The count at the end of a sidebar button's row, or nothing when the button has none or it is 0. */
function buttonBadge(key: string, attentionTrackers: number, invoiceAlerts: number) {
  if (key === "work-trackers" && attentionTrackers > 0) {
    return {
      count: attentionTrackers,
      label: `${attentionTrackers} work trackers by your drivers need your attention`,
      testId: "sidebar-attention-badge",
    };
  }
  if (key === "accountant" && invoiceAlerts > 0) {
    return {
      count: invoiceAlerts,
      label: `${invoiceAlerts} QuickBooks invoices need your attention`,
      testId: "sidebar-invoice-attention-badge",
    };
  }
  return undefined;
}

function renderItem(
  item: SidebarItemConfig,
  pathname: string,
  hasUnreadChangelog: boolean,
  badges: Record<string, number>,
  attentionTrackers: number,
  invoiceAlerts: number,
) {
  switch (item.type) {
    case "button":
      return (
        <SideNavButton
          key={item.key}
          label={item.label}
          href={item.href}
          activePrefixes={item.activePrefixes}
          icon={item.icon}
          showIndicator={item.key === "changelog" && hasUnreadChangelog}
          badge={buttonBadge(item.key, attentionTrackers, invoiceAlerts)}
        />
      );
    case "dropdown":
      return (
        <SideNavDropdown
          key={item.key}
          label={item.label}
          icon={item.icon}
          children={item.children}
          badges={badges}
        />
      );
    case "section":
      return (
        <SideNavSection key={item.key} item={item} pathname={pathname}>
          {item.children.map((child) =>
            renderItem(
              child,
              pathname,
              hasUnreadChangelog,
              badges,
              attentionTrackers,
              invoiceAlerts,
            ),
          )}
        </SideNavSection>
      );
  }
}

export default SideBar;
