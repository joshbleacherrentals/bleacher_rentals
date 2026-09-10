"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState, useEffect } from "react";

type DropdownChild = {
  label: string;
  href: string;
};

type SideNavDropdownProps = {
  label: string;
  icon: React.ComponentType<any>;
  children: DropdownChild[];
  /**
   * Unread counts keyed by child href. Shown on the child, and summed onto the
   * dropdown itself while it is collapsed — otherwise a count inside a closed
   * dropdown is a notification nobody can see.
   */
  badges?: Record<string, number>;
};

function Badge({ count, label }: { count: number; label: string }) {
  return (
    <span
      data-testid="sidebar-badge"
      aria-label={label}
      className="ml-auto shrink-0 rounded-full bg-amber-500 px-1.5 text-xs font-semibold text-white"
    >
      {count}
    </span>
  );
}

export const SideNavDropdown = ({ label, icon: Icon, children, badges }: SideNavDropdownProps) => {
  const pathname = usePathname();
  const isAnyChildSelected = children.some((child) => pathname.startsWith(child.href));
  const [isOpen, setIsOpen] = useState(isAnyChildSelected);
  const collapsedCount = children.reduce((sum, child) => sum + (badges?.[child.href] ?? 0), 0);

  useEffect(() => {
    if (isAnyChildSelected) setIsOpen(true);
  }, [isAnyChildSelected]);

  return (
    <div>
      <button
        onClick={() => setIsOpen((prev) => !prev)}
        className={`min-w-0 flex items-center text-base px-4 py-1 rounded m-1 space-x-3 cursor-pointer ${
          isAnyChildSelected
            ? "font-medium text-darkBlue bg-gray-200"
            : "text-gray-500 hover:bg-gray-200"
        }`}
      >
        <Icon className="h-4 w-4 shrink-0" />
        <span className="flex-1 truncate text-left">{label}</span>
        {!isOpen && collapsedCount > 0 && (
          <Badge count={collapsedCount} label={`${collapsedCount} items need attention`} />
        )}
        {isOpen ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0" />
        )}
      </button>
      {isOpen && (
        <div className="ml-6 min-w-0">
          {children.map((child) => {
            const isSelected = pathname.startsWith(child.href);
            return (
              <Link
                key={child.href}
                href={child.href}
                prefetch={true}
                className={`flex items-center min-w-0 text-sm px-4 py-1 rounded m-1 ${
                  isSelected
                    ? "font-medium text-darkBlue bg-gray-200"
                    : "text-gray-500 hover:bg-gray-200"
                }`}
              >
                <span className="truncate">{child.label}</span>
                {(badges?.[child.href] ?? 0) > 0 && (
                  <Badge
                    count={badges![child.href]}
                    label={`${badges![child.href]} bleachers need attention`}
                  />
                )}
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
};
