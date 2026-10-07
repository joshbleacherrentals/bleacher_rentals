"use client";

import { Color } from "@/types/Color";
import TabNavigation from "./bleachers/_lib/components/TabNavigation";
import { SheetAddBleacher } from "./bleachers/_lib/components/sheets/SheetAddBleacher";
import { SheetAddDocumentEntry } from "./documents/_lib/components/sheets/SheetAddDocumentEntry";
import { SheetAddOtherAsset } from "./other-assets/_lib/components/sheets/SheetAddOtherAsset";
import { usePathname } from "next/navigation";
import { useTeamPermissions } from "@/features/manageTeam/hooks/useTeamPermissions";
import { canEditBleachers } from "@/features/userAccess/logic/canEditBleachers";

export default function AssetsLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const { isAdmin, isMaintainer } = useTeamPermissions();

  // Documents and other assets stay admin-only; a maintainer is only let into the bleachers table.
  const getSheetButton = () => {
    if (pathname.includes("/assets/documents")) return isAdmin ? <SheetAddDocumentEntry /> : null;
    if (pathname.includes("/assets/other-assets")) return isAdmin ? <SheetAddOtherAsset /> : null;
    return canEditBleachers({ isAdmin, isMaintainer }) ? <SheetAddBleacher /> : null;
  };

  return (
    <main className="p-4">
      <div className="flex justify-between items-center mb-4">
        {/* Left Side: Title & Description */}
        <div>
          <h1 className="text-2xl text-darkBlue font-bold">Master Asset List</h1>
          <p className="text-sm" style={{ color: Color.GRAY }}>
            Manage your assets here.
          </p>
        </div>
        {getSheetButton()}
      </div>
      <TabNavigation />
      {children}
    </main>
  );
}
