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

  return (
    <div
      className="w-56 shrink-0 bg-gray-100 border-r border-gray-200 flex flex-col h-full overflow-x-hidden"
      data-testid="sidebar"
    >
      <nav className="flex-1 overflow-y-auto overflow-x-hidden pt-2">
        {items.map((item) => renderItem(item, pathname, hasUnreadChangelog, badges))}
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

function renderItem(
  item: SidebarItemConfig,
  pathname: string,
  hasUnreadChangelog: boolean,
  badges: Record<string, number>,
) {
  switch (item.type) {
    case "button":
      return (
        <SideNavButton
          key={item.key}
          label={item.label}
          href={item.href}
          icon={item.icon}
          showIndicator={item.key === "changelog" && hasUnreadChangelog}
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
          {item.children.map((child) => renderItem(child, pathname, hasUnreadChangelog, badges))}
        </SideNavSection>
      );
  }
}

export default SideBar;
