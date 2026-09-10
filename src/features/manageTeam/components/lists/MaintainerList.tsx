"use client";
import { useMaintainers } from "../../hooks/useMaintainers";
import { UserAvatar } from "../util/UserAvatar";
import { STATUSES } from "@/features/manageTeam/constants";
import { useMemo } from "react";
import { useRouter } from "next/navigation";

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

export function MaintainerList({ showInactive = false }: { showInactive?: boolean }) {
  const maintainers = useMaintainers();
  const router = useRouter();

  const handleClick = (userUuid: string) => {
    router.push(`/team/${userUuid}/edit/basic-user-info`);
  };

  const filteredMaintainers = showInactive
    ? maintainers
    : maintainers.filter((d) => d.statusUuid !== STATUSES.inactive && d.isActive === 1);

  if (filteredMaintainers.length === 0) {
    return (
      <div className="bg-white rounded-lg border border-gray-200 p-8 text-center">
        <p className="text-gray-500">No maintainers found</p>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg border border-gray-200 overflow-hidden">
      <div className="overflow-auto">
        <table className="w-full divide-y divide-gray-200">
          <thead className="bg-gray-50">
            <tr>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Maintainer
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Contact
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Admin
              </th>
            </tr>
          </thead>
          <tbody className="bg-white divide-y divide-gray-200">
            {filteredMaintainers.map((maint) => (
              <tr
                key={maint.userUuid}
                className="hover:bg-gray-50 transition-colors cursor-pointer"
                onClick={() => handleClick(maint.userUuid)}
              >
                <td className="px-4 py-2">
                  <div className="flex items-start gap-3">
                    <UserAvatar
                      clerkUserId={maint.clerkUserId}
                      firstName={maint.firstName}
                      lastName={maint.lastName}
                      className="w-10 h-10 flex-shrink-0"
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-medium text-gray-900 truncate">
                        {maint.firstName} {maint.lastName}
                      </div>
                      <div className="text-xs text-gray-500">
                        Member since {formatDate(maint.createdAt)}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-4 py-4">
                  <div className="text-sm text-gray-900 break-words">{maint.email}</div>
                </td>
                <td className="px-4 py-4">
                  <StatusBadge statusUuid={maint.statusUuid} />
                </td>
                <td className="px-4 py-4">
                  {maint.isAdmin ? (
                    <span className="px-2 py-1 rounded-full text-xs font-medium bg-amber-100 text-amber-800">
                      Admin
                    </span>
                  ) : (
                    <span className="text-sm text-gray-400">—</span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
