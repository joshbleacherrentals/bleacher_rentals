"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { useUserFormPaths } from "@/features/manageTeam/hooks/useUserFormPaths";

/**
 * The accountant role has no settings of its own — granting it is the whole
 * decision — so this is a confirmation panel rather than a form. It exists
 * because every role in the team flow has a tab, and a tab that led nowhere
 * would read as a page that failed to load.
 */
export function AccountantPageContent() {
  const router = useRouter();
  const params = useParams();
  const userUuidFromUrl = params.userUuid as string | undefined;
  const { basicUserInfo } = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);

  useEffect(() => {
    const isLoading = (userUuidFromUrl || existingUserUuid) && roleTabs.length === 0;

    if (!isLoading && !roleTabs.includes("accountant")) {
      router.push(basicUserInfo);
    }
  }, [roleTabs, router, basicUserInfo, existingUserUuid, userUuidFromUrl]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Accountant</h2>
        <p className="text-sm text-gray-600">
          This role is for the people who work with finances. It has no permissions yet.
        </p>
      </div>

      <div className="rounded-md border border-teal-200 bg-teal-50 p-3 text-sm text-teal-900">
        <p className="font-semibold">Accountant capabilities</p>
        <p>
          For now an Accountant can sign in and read the Role Permissions and What&apos;s New pages,
          and nothing else. The rest of the dashboard is hidden from them. What this role can do
          will be defined later.
        </p>
      </div>
    </section>
  );
}
