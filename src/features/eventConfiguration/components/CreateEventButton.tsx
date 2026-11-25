import { Minus, Plus, X, ChevronDown, Wrench, Handshake } from "lucide-react";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useUser } from "@clerk/nextjs";
import { createErrorToast } from "@/components/toasts/ErrorToast";
import { usePsUsers } from "@/features/dashboard/db/hooks/powersync/usePsUsers";
import { useCurrentEventStore } from "../state/useCurrentEventStore";
import { useRepairWindowsStore } from "@/features/repairs/state/useRepairWindowsStore";
import { useState, useRef, useEffect } from "react";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canManageDamageAndMaintenance } from "@/features/userAccess/logic/canManageDamageAndMaintenance";
import { useSubrentalEventStore } from "@/features/subrentals/state/useSubrentalEventStore";
import { SUBRENTAL_COLOR } from "@/features/dashboard/values/constants";

const subrentalHex = `#${SUBRENTAL_COLOR.toString(16).padStart(6, "0")}`;

/** Which items of the "+ Create" menu are drawn (docs/specs/repairs-11-dashboard.md §2.3, D210, D215). */
export type CreateMenuShow = { maintenance: boolean; subrental: boolean };

/**
 * "Maintenance Event" opens the New repair window, so it is for an administrator and a maintainer;
 * "Sub-Rental Request" is for an administrator and an account manager. A person with several roles
 * gets the items of all of them.
 */
export function createMenuFor(roles: {
  isAdmin: boolean;
  isAccountManager: boolean;
  isMaintainer: boolean;
}): CreateMenuShow {
  return {
    maintenance: canManageDamageAndMaintenance({
      isAdmin: roles.isAdmin,
      isMaintainer: roles.isMaintainer,
    }),
    subrental: roles.isAdmin || roles.isAccountManager,
  };
}

export const CreateEventButton = () => {
  const permissions = useTeamPermissions();
  const show = createMenuFor(permissions);
  const currentEventStore = useCurrentEventStore();
  const subrentalsStore = useSubrentalEventStore();
  const { user } = useUser();
  const users = usePsUsers();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropdownOpen) return;
    const handleClick = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [dropdownOpen]);

  const resolveCurrentUserUuid = () => {
    const clerkId = user?.id;
    if (clerkId) {
      const match = users.find((u) => u.clerk_user_id === clerkId);
      if (match) return match.id;
    }
    return null;
  };

  // Event config form is expanded
  if (currentEventStore.isFormExpanded) {
    return (
      <div className="flex items-center justify-end gap-2">
        {!currentEventStore.isFormMinimized ? (
          <>
            <button
              onClick={() => currentEventStore.setField("isFormMinimized", true)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <Minus />
            </button>
            <button
              onClick={() => {
                currentEventStore.setField("isFormExpanded", false);
                currentEventStore.resetForm();
              }}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => currentEventStore.setField("isFormMinimized", false)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <Plus />
            </button>
            <button
              onClick={() => {
                currentEventStore.setField("isFormExpanded", false);
                currentEventStore.resetForm();
              }}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-darkBlue border-transparent border transition text-gray-500 hover:text-darkBlue text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        )}
      </div>
    );
  }

  // Sub-rental form is expanded
  if (subrentalsStore.isFormExpanded) {
    return (
      <div className="flex items-center justify-end gap-2">
        <span className="text-xs font-semibold mb-2" style={{ color: subrentalHex }}>
          SUB-RENTAL
        </span>
        {!subrentalsStore.isFormMinimized ? (
          <>
            <button
              onClick={() => subrentalsStore.setField("isFormMinimized", true)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-indigo-600 border-transparent border transition text-gray-500 hover:text-indigo-600 text-3xl cursor-pointer"
            >
              <Minus />
            </button>
            <button
              onClick={() => subrentalsStore.closeForm()}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-indigo-600 border-transparent border transition text-gray-500 hover:text-indigo-600 text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        ) : (
          <>
            <button
              onClick={() => subrentalsStore.setField("isFormMinimized", false)}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-indigo-600 border-transparent border transition text-gray-500 hover:text-indigo-600 text-3xl cursor-pointer"
            >
              <Plus />
            </button>
            <button
              onClick={() => subrentalsStore.closeForm()}
              className="px-2 py-2 bg-transparent font-light rounded mb-2 hover:bg-gray-100 hover:border-indigo-600 border-transparent border transition text-gray-500 hover:text-indigo-600 text-3xl cursor-pointer"
            >
              <X />
            </button>
          </>
        )}
      </div>
    );
  }

  // Someone with neither a maintenance event nor a sub-rental request to offer has no button.
  if (!show.maintenance && !show.subrental) return null;

  // No form expanded: one "+ Create" button. The dashboard no longer creates events
  // (docs/specs/dashboard-events-read-only.md), so its menu holds only the two things it can create,
  // each for the roles that may (docs/specs/repairs-11-dashboard.md §2.3).
  return (
    <div className="mb-2 flex items-center justify-end" ref={dropdownRef}>
      <div className="relative flex">
        <PrimaryButton
          type="button"
          aria-haspopup="menu"
          aria-expanded={dropdownOpen}
          onClick={() => setDropdownOpen((o) => !o)}
        >
          + Create
          <ChevronDown
            className={`h-3.5 w-3.5 transition-transform ${dropdownOpen ? "rotate-180" : ""}`}
          />
        </PrimaryButton>
        {dropdownOpen && (
          <div
            role="menu"
            className="absolute top-full right-0 mt-1 bg-white border border-gray-200 rounded shadow-md z-50 min-w-[180px]"
          >
            <CreateMenuItems
              show={show}
              onMaintenance={() => {
                // The New repair window, empty: the same as the New repair button of the Repairs page.
                setDropdownOpen(false);
                useRepairWindowsStore.getState().open({ kind: "new" });
              }}
              onSubrental={() => {
                setDropdownOpen(false);
                subrentalsStore.openForm();
                const resolved = resolveCurrentUserUuid();
                if (resolved) {
                  useSubrentalEventStore.getState().setField("createdByUserUuid", resolved);
                }
              }}
            />
          </div>
        )}
      </div>
    </div>
  );
};

/** What the open "+ Create" menu offers. Its own component so a test can draw it. */
export const CreateMenuItems = ({
  show,
  onMaintenance,
  onSubrental,
}: {
  show: CreateMenuShow;
  onMaintenance: () => void;
  onSubrental: () => void;
}) => (
  <>
    {show.maintenance && (
      <button
        type="button"
        role="menuitem"
        onClick={onMaintenance}
        className="w-full cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
      >
        <Wrench className="h-3.5 w-3.5" />
        Maintenance Event
      </button>
    )}
    {show.subrental && (
      <button
        type="button"
        role="menuitem"
        onClick={onSubrental}
        className="w-full cursor-pointer px-3 py-2 text-sm text-gray-600 hover:bg-gray-100 flex items-center gap-2"
      >
        <Handshake className="h-3.5 w-3.5" />
        Sub-Rental Request
      </button>
    )}
  </>
);
