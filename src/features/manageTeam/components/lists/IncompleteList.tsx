"use client";
import { useIncomplete } from "../../hooks/useIncomplete";
import { UserAvatar } from "../util/UserAvatar";
import { STATUSES } from "@/features/manageTeam/constants";
import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import { useRouter } from "next/navigation";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

function StatusBadge({ statusUuid }: { statusUuid: string | null }) {
  const config = useMemo(() => {
    switch (statusUuid) {
      case STATUSES.active:
        return { label: "Active", color: "bg-green-100 text-green-800" };
      case STATUSES.invited:
        return { label: "Pending", color: "bg-yellow-100 text-yellow-800" };
      case STATUSES.inactive:
        return { label: "Deactivated", color: "bg-red-100 text-red-800" };
      default:
        return { label: "Unknown", color: "bg-gray-100 text-gray-800" };
    }
  }, [statusUuid]);

  return (
    <span className={`px-2 py-1 rounded-full text-xs font-medium ${config.color}`}>
      {config.label}
    </span>
  );
}

function formatDate(dateString: string | null) {
  if (!dateString) return "Unknown";
  const date = new Date(dateString);
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(date);
}

type IncompleteUser = ReturnType<typeof useIncomplete>[number];

function IncompleteTable({
  users,
  onRowClick,
}: {
  users: IncompleteUser[];
  onRowClick: (userUuid: string) => void;
}) {
  return (
    <div className="overflow-auto bg-white">
      <table className="w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              User
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Contact
            </th>
            <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
              Status
            </th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {users.map((user) => (
            <tr
              key={user.userUuid}
              className="hover:bg-red-50 transition-colors cursor-pointer"
              onClick={() => onRowClick(user.userUuid)}
            >
              <td className="px-4 py-2">
                <div className="flex items-start gap-3">
                  <UserAvatar
                    clerkUserId={user.clerkUserId}
                    firstName={user.firstName}
                    lastName={user.lastName}
                    className="w-10 h-10 flex-shrink-0"
                  />
                  <div className="min-w-0">
                    <div className="text-sm font-medium text-gray-900 truncate">
                      {user.firstName} {user.lastName}
                    </div>
                    <div className="text-xs text-gray-500">
                      Member since {formatDate(user.createdAt)}
                    </div>
                  </div>
                </div>
              </td>
              <td className="px-4 py-4">
                <div className="text-sm text-gray-900 break-words">{user.email}</div>
              </td>
              <td className="px-4 py-4">
                <StatusBadge statusUuid={user.statusUuid} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * This component only shows if a user was created but never assigned to any roles.
 *
 * Active/pending incomplete users render inline (always). Deactivated incomplete
 * users are kept out of the inline alert — they're reachable through a button that
 * opens a modal, but only while the "Show Inactive" toggle is on.
 */
export function IncompleteList({ showInactive = false }: { showInactive?: boolean }) {
  const incompleteUsers = useIncomplete();
  const router = useRouter();
  const [deactivatedModalOpen, setDeactivatedModalOpen] = useState(false);

  const handleClick = (userUuid: string) => {
    router.push(`/team/${userUuid}/edit`);
  };

  const activeUsers = incompleteUsers.filter((user) => user.statusUuid !== STATUSES.inactive);
  const deactivatedUsers = incompleteUsers.filter((user) => user.statusUuid === STATUSES.inactive);

  const showDeactivatedButton = showInactive && deactivatedUsers.length > 0;

  if (activeUsers.length === 0 && !showDeactivatedButton) {
    return null;
  }

  return (
    <div className="mb-8">
      {activeUsers.length > 0 && (
        <div className="bg-red-50 border-2 border-red-300 rounded-lg overflow-hidden">
          <div className="bg-red-100 px-4 py-3 border-b border-red-300">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              <h2 className="text-lg font-semibold text-red-900">Incomplete User Setup</h2>
            </div>
            <p className="text-sm text-red-700 mt-1">
              The following users have been created but are not assigned any roles. Users must be an
              Admin, Account Manager, Driver, Developer, Maintainer, or Viewer to access the
              application.
            </p>
          </div>
          <IncompleteTable users={activeUsers} onRowClick={handleClick} />
        </div>
      )}

      {showDeactivatedButton && (
        <div className={activeUsers.length > 0 ? "mt-3" : ""}>
          <button
            onClick={() => setDeactivatedModalOpen(true)}
            className="flex items-center gap-2 px-3 py-2 text-sm font-medium text-red-700 border border-red-300 rounded-md hover:bg-red-50 transition cursor-pointer"
          >
            <AlertTriangle className="h-4 w-4" />
            {deactivatedUsers.length} Deactivated Incomplete{" "}
            {deactivatedUsers.length === 1 ? "User" : "Users"}
          </button>
        </div>
      )}

      <Dialog open={deactivatedModalOpen} onOpenChange={setDeactivatedModalOpen}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-red-900">
              <AlertTriangle className="h-5 w-5 text-red-600" />
              Deactivated Incomplete Users
            </DialogTitle>
            <DialogDescription>
              These deactivated users were created but never assigned any roles.
            </DialogDescription>
          </DialogHeader>
          <div className="border border-gray-200 rounded-lg overflow-hidden">
            <IncompleteTable users={deactivatedUsers} onRowClick={handleClick} />
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
