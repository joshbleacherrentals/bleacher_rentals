"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { useUserFormPaths } from "@/features/manageTeam/hooks/useUserFormPaths";

/**
 * The maintainer role has no settings of its own — granting it is the whole
 * decision — so this is a confirmation panel rather than a form. It exists
 * because every role in the team flow has a tab, and a tab that led nowhere
 * would read as a page that failed to load.
 */
export function MaintainerPageContent() {
  const router = useRouter();
  const params = useParams();
  const userUuidFromUrl = params.userUuid as string | undefined;
  const { basicUserInfo } = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);

  useEffect(() => {
    const isLoading = (userUuidFromUrl || existingUserUuid) && roleTabs.length === 0;

    if (!isLoading && !roleTabs.includes("maintainer")) {
      router.push(basicUserInfo);
    }
  }, [roleTabs, router, basicUserInfo, existingUserUuid, userUuidFromUrl]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Maintainer</h2>
        <p className="text-sm text-gray-600">
          This role grants the Annual Inspections queue, and nothing else.
        </p>
      </div>

      <div className="rounded-md border border-orange-200 bg-orange-50 p-3 text-sm text-orange-900">
        <p className="font-semibold">Maintainer capabilities</p>
        <p>
          Maintainers see every bleacher ordered by how soon its annual inspection is due, record an
          inspection, upload the certificate and keep the notes. They can open a bleacher to read
          its inspection history, but cannot change anything else about it, and the rest of the
          dashboard stays hidden from them.
        </p>
      </div>
    </section>
  );
}
