"use client";

import { PageHeader } from "@/components/PageHeader";
import { PrimaryButton } from "@/components/PrimaryButton";
import RoleNavigation from "./RoleNavigation";
import { useUserFormSubmit } from "../hooks/useUserFormSubmit";
import {
  useTeamPermissions,
  getEditAccess,
  getEditCapabilities,
} from "../hooks/useTeamPermissions";
import { useCurrentUserStore } from "../state/useCurrentUserStore";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { EditAccessProvider } from "../state/EditAccessContext";
import { hasNoRoles as holdsNoRole } from "../logic/teamRoles";

interface UserFormLayoutProps {
  children: React.ReactNode;
}

export function UserFormLayout({ children }: UserFormLayoutProps) {
  const { handleSubmit, isSubmitting, existingUserUuid } = useUserFormSubmit();
  const permissions = useTeamPermissions();
  const isDriver = useCurrentUserStore((s) => s.isDriver);
  const accountManagerUuid = useCurrentUserStore((s) => s.accountManagerUuid);
  const assignedDriverZoneUuids = useCurrentUserStore((s) => s.assignedDriverZoneUuids);
  const accountManagerZoneIds = usePermissionsStore((s) => s.accountManagerZoneIds);
  const isAdminFlag = useCurrentUserStore((s) => s.isAdmin);
  const isViewer = useCurrentUserStore((s) => s.isViewer);
  const isAccountManagerFlag = useCurrentUserStore((s) => s.isAccountManager);
  const isDeveloper = useCurrentUserStore((s) => s.isDeveloper);
  const isAccountant = useCurrentUserStore((s) => s.isAccountant);
  // Mirrors useIncomplete.ts's definition of an "incomplete" user (no role assigned yet).
  const hasNoRoles = holdsNoRole({
    isAdmin: isAdminFlag,
    isViewer,
    isDriver,
    isAccountManager: isAccountManagerFlag,
    isDeveloper,
    isAccountant,
  });

  const editAccess = existingUserUuid
    ? getEditAccess(
        permissions,
        existingUserUuid,
        { isDriver, accountManagerUuid, assignedDriverZoneUuids, hasNoRoles },
        accountManagerZoneIds,
      )
    : permissions.canCreateUser
      ? "full"
      : "read-only";

  const isReadOnly = editAccess === "read-only";
  const isZonesOnly = editAccess === "zones-only";
  const isDriverOnly = editAccess === "driver-only";
  const isZonesAndDriver = editAccess === "zones-and-driver";
  // Every level but "read-only" can save: "zones-only" persists just the zone assignment,
  // "driver-only" just the payment info and vendor (docs/specs/accountant-team.md).
  const canSave = !isReadOnly;
  // The three partial levels lock the whole form; the driver page opts back in what stays editable.
  const { lockedWithExceptions } = getEditCapabilities(editAccess);

  return (
    <main>
      <PageHeader
        title={existingUserUuid ? "Edit Team Member" : "Add A Team Member"}
        subtitle="Configure user details, roles, and permissions. All sections marked with * are required."
        action={
          canSave ? (
            <PrimaryButton
              onClick={() => handleSubmit(editAccess)}
              loading={isSubmitting}
              loadingText="Saving..."
            >
              {existingUserUuid ? "Save Changes" : "Save & Send Invite"}
            </PrimaryButton>
          ) : undefined
        }
      />

      {canSave && <RoleNavigation editAccess={editAccess} />}

      {isReadOnly && existingUserUuid && (
        <div className="mt-4 rounded-lg border border-yellow-300 bg-yellow-50 px-4 py-3 text-sm text-yellow-800">
          You have read-only access to this team member.
        </div>
      )}

      {isZonesOnly && (
        <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You can only assign this driver to your zones. Their other details are managed by an admin
          or an account manager who shares a zone with them.
        </div>
      )}

      {isDriverOnly && (
        <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You can edit this driver&apos;s payment info, vendor and driver type. Everything else is
          read-only.
        </div>
      )}

      {isZonesAndDriver && (
        <div className="mt-4 rounded-lg border border-blue-300 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          You can add this driver to your zones and edit their payment info, vendor and driver type.
          Everything else is read-only.
        </div>
      )}

      <EditAccessProvider value={editAccess}>
        {/* read-only locks everything; zones-only, driver-only and zones-and-driver lock everything
            except what the driver page opts back in with pointer-events-auto (the zone
            multi-select, the payment info and the vendor). */}
        <div
          className={`mt-6 ${isReadOnly && existingUserUuid ? "pointer-events-none opacity-60" : ""} ${lockedWithExceptions ? "pointer-events-none" : ""}`}
        >
          {children}
        </div>
      </EditAccessProvider>
    </main>
  );
}
