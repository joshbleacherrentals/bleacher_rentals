"use client";
// import { UserList } from "../../features/manageTeam/components/lists/UserList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { DriverList } from "@/features/manageTeam/components/lists/DriverList";
import { AccountManagerList } from "@/features/manageTeam/components/lists/AccountManagerList";
import { AdminList } from "@/features/manageTeam/components/lists/AdminList";
import { DeveloperList } from "@/features/manageTeam/components/lists/DeveloperList";
import { MaintainerList } from "@/features/manageTeam/components/lists/MaintainerList";
import { AccountantList } from "@/features/manageTeam/components/lists/AccountantList";
import { ViewerList } from "@/features/manageTeam/components/lists/ViewerList";
import { IncompleteList } from "@/features/manageTeam/components/lists/IncompleteList";
import TabNavigation, { TeamTab } from "../../features/manageTeam/components/inputs/TabNavigation";
import SearchBar from "../../features/manageTeam/components/inputs/SearchBar";
import { Toggle } from "@/components/Toggle";
import { useState, useEffect, type ReactNode } from "react";
import { useSearchQueryStore } from "@/features/manageTeam/state/useSearchQueryStore";
import { useRealtimeHydrateCurrentUserStore } from "@/features/manageTeam/hooks/useUserById";
import { PageHeader } from "@/components/PageHeader";
import { useRouter } from "next/navigation";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";

export type ExistingUser = {
  user_id: number;
  first_name: string;
  last_name: string;
  email: string;
  role: number;
  status: number;
  clerk_user_id: string | null;
  homeBases: { id: number; label: string }[];
} | null;

/**
 * An accountant opens the profile of a driver and of nobody else (docs/specs/accountant-team.md,
 * D5): the lists show every user, but a row that is not a driver's does not react to a click. The
 * click is stopped before the row's own handler sees it, and the row stops looking clickable. Text
 * stays selectable, so an email can still be copied.
 *
 * This is a convenience, not the lock: the database does not let an accountant read the Users row
 * of anyone who is not a driver, and `getEditAccess` leaves such a profile read-only.
 */
function RowsNotClickable({ active, children }: { active: boolean; children: ReactNode }) {
  if (!active) return <>{children}</>;
  return (
    <div
      onClickCapture={(e) => {
        if ((e.target as Element).closest("tbody tr")) e.stopPropagation();
      }}
      className="[&_tbody_tr]:cursor-default [&_tbody_tr]:hover:bg-transparent"
    >
      {children}
    </div>
  );
}

export default function TeamPage() {
  useRealtimeHydrateCurrentUserStore();
  const router = useRouter();
  const { canCreateUser, canOpenAnyProfile } = useTeamPermissions();
  const rowsLocked = !canOpenAnyProfile;
  const [activeTab, setActiveTab] = useState<TeamTab>("admins");
  const [showInactive, setShowInactive] = useState(false);
  const setField = useSearchQueryStore((s) => s.setField);

  // Reset search query when leaving page
  useEffect(() => {
    return () => {
      setField("searchQuery", "");
    };
  }, [setField]);

  return (
    <main>
      <PageHeader
        title="Manage Team"
        subtitle="Manage your team here."
        action={
          canCreateUser ? (
            <PrimaryButton onClick={() => router.push("/team/new")}>
              + Add Team Member
            </PrimaryButton>
          ) : undefined
        }
      />

      <div className="flex justify-between items-center mb-6">
        <div className="flex items-center gap-4">
          <TabNavigation activeTab={activeTab} onTabChange={setActiveTab} />
          <SearchBar />
        </div>
        <Toggle
          label="Show Inactive"
          tooltip={false}
          checked={showInactive}
          onChange={setShowInactive}
          inline={true}
        />
      </div>

      {/* Incomplete Users Alert - Shows regardless of tab */}
      <RowsNotClickable active={rowsLocked}>
        <IncompleteList showInactive={showInactive} />
      </RowsNotClickable>

      {/* Admins Section */}
      {activeTab === "admins" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Admins</h2>
          <RowsNotClickable active={rowsLocked}>
            <AdminList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* Account Managers Section */}
      {activeTab === "account-managers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Managers</h2>
          <RowsNotClickable active={rowsLocked}>
            <AccountManagerList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* Drivers Section */}
      {activeTab === "drivers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Drivers</h2>
          <DriverList showInactive={showInactive} />
        </div>
      )}

      {/* Developers Section */}
      {activeTab === "developers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Developers</h2>
          <RowsNotClickable active={rowsLocked}>
            <DeveloperList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* Maintainers Section */}
      {activeTab === "maintainers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Maintainers</h2>
          <RowsNotClickable active={rowsLocked}>
            <MaintainerList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* Accountants Section */}
      {activeTab === "accountants" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Accountants</h2>
          <RowsNotClickable active={rowsLocked}>
            <AccountantList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* Viewers Section */}
      {activeTab === "viewers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewers</h2>
          <RowsNotClickable active={rowsLocked}>
            <ViewerList showInactive={showInactive} />
          </RowsNotClickable>
        </div>
      )}

      {/* All Users Section */}
      {activeTab === "all" && (
        <div>
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Admins</h2>
            <RowsNotClickable active={rowsLocked}>
              <AdminList showInactive={showInactive} />
            </RowsNotClickable>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Managers</h2>
            <RowsNotClickable active={rowsLocked}>
              <AccountManagerList showInactive={showInactive} />
            </RowsNotClickable>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Drivers</h2>
            <DriverList showInactive={showInactive} />
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Developers</h2>
            <RowsNotClickable active={rowsLocked}>
              <DeveloperList showInactive={showInactive} />
            </RowsNotClickable>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Maintainers</h2>
            <RowsNotClickable active={rowsLocked}>
              <MaintainerList showInactive={showInactive} />
            </RowsNotClickable>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Accountants</h2>
            <RowsNotClickable active={rowsLocked}>
              <AccountantList showInactive={showInactive} />
            </RowsNotClickable>
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Viewers</h2>
            <RowsNotClickable active={rowsLocked}>
              <ViewerList showInactive={showInactive} />
            </RowsNotClickable>
          </div>
        </div>
      )}
    </main>
  );
}
