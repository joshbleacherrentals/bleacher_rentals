"use client";
// import { UserList } from "../../features/manageTeam/components/lists/UserList";
import { PrimaryButton } from "@/components/PrimaryButton";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { DriverList } from "@/features/manageTeam/components/lists/DriverList";
import { AccountManagerList } from "@/features/manageTeam/components/lists/AccountManagerList";
import { AdminList } from "@/features/manageTeam/components/lists/AdminList";
import { DeveloperList } from "@/features/manageTeam/components/lists/DeveloperList";
import { IncompleteList } from "@/features/manageTeam/components/lists/IncompleteList";
import TabNavigation, { TeamTab } from "../../features/manageTeam/components/inputs/TabNavigation";
import SearchBar from "../../features/manageTeam/components/inputs/SearchBar";
import { Toggle } from "@/components/Toggle";
import { useState, useEffect } from "react";
import { useSearchQueryStore } from "@/features/manageTeam/state/useSearchQueryStore";
import { useRealtimeHydrateCurrentUserStore } from "@/features/manageTeam/hooks/useUserById";
import { PageHeader } from "@/components/PageHeader";
import { useRouter } from "next/navigation";

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

export default function TeamPage() {
  useRealtimeHydrateCurrentUserStore();
  const router = useRouter();
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
          <PrimaryButton onClick={() => router.push("/team/new")}>+ Add Team Member</PrimaryButton>
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
      <IncompleteList showInactive={showInactive} />

      {/* Admins Section */}
      {activeTab === "admins" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Admins</h2>
          <AdminList showInactive={showInactive} />
        </div>
      )}

      {/* Account Managers Section */}
      {activeTab === "account-managers" && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Managers</h2>
          <AccountManagerList showInactive={showInactive} />
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
          <DeveloperList showInactive={showInactive} />
        </div>
      )}

      {/* All Users Section */}
      {activeTab === "all" && (
        <div>
          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Admins</h2>
            <AdminList showInactive={showInactive} />
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Account Managers</h2>
            <AccountManagerList showInactive={showInactive} />
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Drivers</h2>
            <DriverList showInactive={showInactive} />
          </div>

          <div className="mb-8">
            <h2 className="text-xl font-semibold text-gray-900 mb-4">Developers</h2>
            <DeveloperList showInactive={showInactive} />
          </div>
        </div>
      )}
    </main>
  );
}
