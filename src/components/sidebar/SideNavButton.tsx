"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { CountBadge } from "@/components/CountBadge";

type SideNavButtonProps = {
  label: string;
  href: string;
  icon: React.ComponentType<any>;
  /** Renders an unread dot to the right of the label. */
  showIndicator?: boolean;
  /**
   * A count in a red pill at the end of the row — work that needs a reaction,
   * not a queue to work through. Absent or 0 renders nothing at all, so the
   * pill disappears by itself once the last such tracker is gone.
   */
  badge?: { count: number; label: string; testId?: string };
};

export const SideNavButton = ({
  label,
  href,
  icon: Icon,
  showIndicator = false,
  badge,
}: SideNavButtonProps) => {
  const pathname = usePathname();
  const isSelected = pathname.startsWith(href);

  return (
    <Link
      href={href}
      prefetch={true}
      className={`flex items-center min-w-0 text-base px-4 py-1 rounded m-1 space-x-3 ${
        isSelected ? " font-medium text-darkBlue bg-gray-200" : "text-gray-500 hover:bg-gray-200"
      }`}
    >
      <Icon className="h-4 w-4 shrink-0" />
      <span className="truncate">{label}</span>
      {badge && badge.count > 0 && (
        <CountBadge
          count={badge.count}
          label={badge.label}
          tone="red"
          className="ml-auto"
          testId={badge.testId}
        />
      )}
      {showIndicator && (
        <span
          data-testid="sidebar-unread-indicator"
          aria-label="New releases"
          className="h-2 w-2 shrink-0 rounded-full bg-blue-600"
        />
      )}
    </Link>
  );
};
