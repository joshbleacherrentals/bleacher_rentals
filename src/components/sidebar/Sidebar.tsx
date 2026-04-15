"use client";
import { useState } from "react";
import { useUser } from "@clerk/nextjs";
import { usePathname } from "next/navigation";
import { useUsersStore } from "@/state/userStore";
import { USER_ROLES } from "@/types/Constants";
import {
  Plus,
  LayoutDashboard,
  Users,
  Truck,
  ClipboardList,
  BarChart3,
  FileText,
  Trophy,
  CalendarDays,
  ClipboardCheck,
  MapPinned,
  Settings,
  ChevronDown,
} from "lucide-react";
import { SideNavButton } from "./SideNavButton";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { QuickBooksIcon } from "@/components/Icons";

const SideBar = () => {
  const { user } = useUser();
  const users = useUsersStore((s) => s.users);
  const currentUser = users.find((u) => u.clerk_user_id === user?.id);
  const openModal = useCurrentEventStore((s) => s.openModal);
  const pathname = usePathname();
  const [configOpen, setConfigOpen] = useState(() =>
    ["/zones", "/inspection-questions", "/quickbooks"].some((p) => pathname.startsWith(p)),
  );

  if (!currentUser) return null;

  // const role = currentUser.role;

  return (
    <div
      className="w-56 bg-gray-100 border-r border-gray-200 flex flex-col h-full"
      data-testid="sidebar"
    >
      <div className="py-2 px-1 ">
        <button
          onClick={openModal}
          className="w-full cursor-pointer rounded p-1 border-1 border-gray-300 shadow-none bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center gap-2"
        >
          <Plus className="h-4 w-4" />
          Create Quote
        </button>
      </div>

      <nav className="flex-1 overflow-auto">
        <SideNavButton
          label="Dashboard"
          href="/dashboard"
          icon={LayoutDashboard}
          roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
        />
        <SideNavButton
          label="Quotes & Bookings"
          href="/quotes-bookings"
          icon={FileText}
          roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
        />
        <SideNavButton label="Team" href="/team" icon={Users} roles={[USER_ROLES.ADMIN]} />
        <SideNavButton label="Assets" href="/assets" icon={Truck} roles={[USER_ROLES.ADMIN]} />
        <SideNavButton
          label="Work Trackers"
          href="/work-trackers"
          icon={ClipboardList}
          roles={[USER_ROLES.ADMIN, USER_ROLES.ACCOUNT_MANAGER]}
        />
        <SideNavButton
          label="Scorecard"
          href="/scorecard"
          icon={BarChart3}
          roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
        />
        <SideNavButton
          label="Leaderboard"
          href="/leaderboard"
          icon={Trophy}
          roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
        />
        <SideNavButton
          label="Driver Calendar"
          href="/driver-calendar"
          icon={CalendarDays}
          roles={[USER_ROLES.ADMIN]}
        />

        {/* Configuration section */}
        <div className="mt-2 border-t border-gray-200 pt-2">
          <button
            onClick={() => setConfigOpen((o) => !o)}
            className="flex items-center w-full px-4 py-1 m-1 text-xs font-semibold uppercase tracking-wider text-gray-400 hover:text-gray-600 cursor-pointer"
          >
            <Settings className="h-3.5 w-3.5 mr-2" />
            <span>Configuration</span>
            <ChevronDown
              className={`h-3.5 w-3.5 ml-auto transition-transform ${configOpen ? "rotate-180" : ""}`}
            />
          </button>
          {configOpen && (
            <div>
              <SideNavButton
                label="Zone Manager"
                href="/zones"
                icon={MapPinned}
                roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
              />
              <SideNavButton
                label="Inspection Form"
                href="/inspection-questions"
                icon={ClipboardCheck}
                roles={[USER_ROLES.ADMIN]}
              />
              <SideNavButton
                label="QuickBooks"
                href="/quickbooks"
                icon={QuickBooksIcon}
                roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
              />
            </div>
          )}
        </div>
      </nav>
    </div>
  );
};

export default SideBar;
