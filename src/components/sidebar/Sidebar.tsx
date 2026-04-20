"use client";
import { useState, useRef, useEffect } from "react";
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
  Wrench,
  ShieldAlert,
} from "lucide-react";
import { SideNavButton } from "./SideNavButton";
import { useCurrentEventStore } from "@/features/eventConfiguration/state/useCurrentEventStore";
import { useMaintenanceEventStore } from "@/features/maintenanceEvents/state/useMaintenanceEventStore";
import { QuickBooksIcon } from "@/components/Icons";

const SideBar = () => {
  const { user } = useUser();
  const users = useUsersStore((s) => s.users);
  const currentUser = users.find((u) => u.clerk_user_id === user?.id);
  const openModal = useCurrentEventStore((s) => s.openModal);
  const openMaintenanceModal = useMaintenanceEventStore((s) => s.openModal);
  const pathname = usePathname();
  const [configOpen, setConfigOpen] = useState(() =>
    ["/zones", "/inspection-questions", "/quickbooks"].some((p) => pathname.startsWith(p)),
  );
  const [createDropdownOpen, setCreateDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close create dropdown on outside click
  useEffect(() => {
    if (!createDropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setCreateDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [createDropdownOpen]);

  if (!currentUser) return null;

  // const role = currentUser.role;

  return (
    <div
      className="w-56 bg-gray-100 border-r border-gray-200 flex flex-col h-full"
      data-testid="sidebar"
    >
      <div className="py-2 px-1">
        <div ref={dropdownRef} className="relative">
          <div className="flex">
            <button
              onClick={openModal}
              className="flex-1 cursor-pointer rounded p-1 border border-gray-300 shadow-none bg-gray-100 hover:bg-gray-200 text-gray-500 flex items-center justify-center gap-2"
            >
              <Plus className="h-4 w-4" />
              Create Quote
            </button>
            {/* <button
              onClick={() => setCreateDropdownOpen((o) => !o)}
              className="cursor-pointer rounded-r p-1 px-1.5 border border-gray-300 shadow-none bg-gray-100 hover:bg-gray-200 text-gray-500"
            >
              <ChevronDown
                className={`h-3.5 w-3.5 transition-transform ${createDropdownOpen ? "rotate-180" : ""}`}
              />
            </button> */}
          </div>
          {createDropdownOpen && (
            <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded shadow-md z-50">
              <button
                onClick={() => {
                  setCreateDropdownOpen(false);
                  openMaintenanceModal();
                }}
                className="w-full cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
              >
                <Wrench className="h-3.5 w-3.5" />
                Maintenance Event
              </button>
            </div>
          )}
        </div>
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
          label="Damage Reports"
          href="/damage-reports"
          icon={ShieldAlert}
          roles={[USER_ROLES.ACCOUNT_MANAGER, USER_ROLES.ADMIN]}
        />
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
