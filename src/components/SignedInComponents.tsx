"use client";
import Header from "@/components/Header";
import SideBar from "@/components/sidebar/Sidebar";
import { SignOutButton } from "@clerk/nextjs";
import { Button } from "./ui/button";
import { useRef, useMemo, useEffect } from "react";
import { LayoutProvider } from "@/contexts/LayoutContexts";
import { useUserAccess } from "@/features/userAccess/client";
import { usePermissionsStore } from "@/features/userAccess/state/usePermissionsStore";
import { useAccessRedirect } from "@/features/userAccess/hooks/useAccessRedirect";
import { mergeRoleConfigs } from "@/features/userAccess/accessConfig";
import { db } from "@/components/providers/SystemProvider";
import { expect, useTypedQuery } from "@/lib/powersync/typedQuery";
import LoadingSpinner from "./LoadingSpinner";
import { CannotFindAccount } from "../features/userAccess/components/CannotFindAccount";
import { NoRolesAssigned } from "../features/userAccess/components/NoRolesAssigned";
import { AccountDeactivated } from "../features/userAccess/components/AccountDeactivated";
import { DriverWelcome } from "@/features/userAccess/components/DriverWelcome";
import { EventConfigModal } from "@/features/eventConfiguration/components/EventConfigModal";

export function SignedInComponents({ children }: { children: React.ReactNode }) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const access = useUserAccess();

  const config = useMemo(
    () => (access.status === "active" ? mergeRoleConfigs(access.roles) : null),
    [access],
  );

  useAccessRedirect(config);

  // Query AM zone assignments reactively
  const amId = access.status === "active" ? access.accountManagerId : null;
  const amZonesCompiled = useMemo(() => {
    const effectiveId = amId ?? "__none__";
    return db
      .selectFrom("AccountManagerZones")
      .select(["zone_uuid", "is_lead"])
      .where("account_manager_uuid", "=", effectiveId)
      .compile();
  }, [amId]);
  const { data: amZoneRows } = useTypedQuery(
    amZonesCompiled,
    expect<{ zone_uuid: string | null; is_lead: number | null }>(),
  );

  // Sync permissions to Zustand store so non-React code (Pixi renderers) can read them
  useEffect(() => {
    if (access.status === "active") {
      usePermissionsStore.setState({
        isAdmin: access.roles.includes("admin"),
        isAccountManager: access.roles.includes("account_manager"),
        accountManagerId: access.accountManagerId,
        accountManagerZoneIds:
          amZoneRows?.filter((r) => r.zone_uuid != null).map((r) => r.zone_uuid!) ?? [],
        leadZoneIds:
          amZoneRows
            ?.filter((r) => r.zone_uuid != null && r.is_lead === 1)
            .map((r) => r.zone_uuid!) ?? [],
        userId: access.userId,
      });
    }
  }, [access, amZoneRows]);

  if (access.status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-screen text-center">
        <LoadingSpinner />
        <div className="mt-6">
          <SignOutButton>
            <Button variant="outline">Log out</Button>
          </SignOutButton>
        </div>
      </div>
    );
  }

  if (access.status === "blocked") {
    switch (access.reason) {
      case "cannot-find-account":
        return <CannotFindAccount />;
      case "account-deactivated":
        return <AccountDeactivated />;
      case "no-roles-assigned":
        return <NoRolesAssigned />;
      case "driver-only":
        return <DriverWelcome />;
    }
  }

  return (
    <LayoutProvider scrollRef={scrollRef}>
      <div className="flex flex-col h-screen">
        <Header />
        <div className="flex flex-1 overflow-hidden">
          {config?.showSidebar && <SideBar />}
          <main ref={scrollRef} className="flex-1  bg-gray-50 overflow-auto">
            {children}
          </main>
        </div>
      </div>
      <EventConfigModal />
    </LayoutProvider>
  );
}
