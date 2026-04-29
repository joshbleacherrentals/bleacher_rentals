"use client";

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCurrentUserStore, TeamRoleTab } from "../state/useCurrentUserStore";
import { useUserFormPaths } from "../hooks/useUserFormPaths";
import { X } from "lucide-react";
import { useState } from "react";

const ROLE_LABELS: Record<TeamRoleTab, string> = {
  administrator: "Administrator",
  "account-manager": "Account Manager",
  driver: "Driver",
  developer: "Developer",
};

const ALL_ROLES: TeamRoleTab[] = ["administrator", "account-manager", "driver", "developer"];

export default function RoleNavigation() {
  const router = useRouter();
  const pathname = usePathname();
  const paths = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const addRoleTab = useCurrentUserStore((s) => s.addRoleTab);
  const removeRoleTab = useCurrentUserStore((s) => s.removeRoleTab);

  const [roleToRemove, setRoleToRemove] = useState<TeamRoleTab | null>(null);

  const availableRoles = ALL_ROLES.filter((role) => !roleTabs.includes(role));
  const shouldHighlightAddRole = roleTabs.length === 0;

  const handleRemoveRole = () => {
    if (roleToRemove) {
      removeRoleTab(roleToRemove);
      router.push(paths.basicUserInfo);
      setRoleToRemove(null);
    }
  };

  return (
    <div className="space-y-3">
      {shouldHighlightAddRole && (
        <div className="rounded border border-red-700 bg-gray-50 px-3 py-2 text-sm text-red-700">
          This user will not be able to access the app without any roles assigned. Please add a role
          to give this user access.
        </div>
      )}

      <div className="flex items-center gap-2 overflow-x-auto">
        <Link
          href={paths.basicUserInfo}
          className={`rounded border px-3 py-1.5 text-sm font-semibold whitespace-nowrap ${
            pathname === paths.basicUserInfo
              ? "border-lightBlue bg-lightBlue/10 text-lightBlue"
              : "border-gray-300 bg-gray-50 text-gray-700"
          }`}
        >
          Basic User Info
        </Link>
        {roleTabs.map((role) => {
          const rolePath = paths[role === "account-manager" ? "accountManager" : role];
          return (
            <div
              key={role}
              className={`flex items-center gap-1 rounded border px-3 py-1.5 text-sm font-medium whitespace-nowrap ${
                pathname === rolePath
                  ? "border-lightBlue bg-lightBlue/10 text-lightBlue"
                  : "border-gray-300 bg-gray-50 text-gray-700"
              }`}
            >
              <Link href={rolePath} className="flex-1">
                {ROLE_LABELS[role]}
              </Link>
              <button
                type="button"
                onClick={(e) => {
                  e.preventDefault();
                  e.stopPropagation();
                  setRoleToRemove(role);
                }}
                className=" text-lightBlue hover:bg-black/10 transition-all rounded-full p-0.5"
                aria-label={`Remove ${ROLE_LABELS[role]} role`}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          );
        })}
        {availableRoles.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button
                type="button"
                className={`px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50 cursor-pointer whitespace-nowrap hover:shadow-sm hover:rounded hover:border hover:border-gray-300 transition ${
                  shouldHighlightAddRole
                    ? "border rounded animate-pulse [animation-duration:0.8s]"
                    : ""
                }`}
              >
                + Add Role
              </button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="min-w-[180px]">
              {availableRoles.map((role) => {
                const rolePath = paths[role === "account-manager" ? "accountManager" : role];
                return (
                  <DropdownMenuItem
                    key={role}
                    onClick={() => {
                      addRoleTab(role);
                      router.push(rolePath);
                    }}
                    className="cursor-pointer"
                  >
                    {ROLE_LABELS[role]}
                  </DropdownMenuItem>
                );
              })}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Dialog open={roleToRemove !== null} onOpenChange={(open) => !open && setRoleToRemove(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Remove the role?</DialogTitle>
            <DialogDescription>
              Are you sure you&apos;d like to remove this role from this user? They will lose access
              to any privileges this role gives them.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleToRemove(null)}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleRemoveRole}>
              Remove Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
