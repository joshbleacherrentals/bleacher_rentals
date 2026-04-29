"use client";

import { useRouter, useParams } from "next/navigation";
import { useEffect } from "react";
import { useCurrentUserStore } from "@/features/manageTeam/state/useCurrentUserStore";
import { useUserFormPaths } from "@/features/manageTeam/hooks/useUserFormPaths";

export function DeveloperPageContent() {
  const router = useRouter();
  const params = useParams();
  const userUuidFromUrl = params.userUuid as string | undefined;
  const { basicUserInfo } = useUserFormPaths();
  const roleTabs = useCurrentUserStore((s) => s.roleTabs);
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);
  const autoSubscribeToNewTickets = useCurrentUserStore((s) => s.autoSubscribeToNewTickets);
  const setField = useCurrentUserStore((s) => s.setField);

  useEffect(() => {
    const isLoading = (userUuidFromUrl || existingUserUuid) && roleTabs.length === 0;

    if (!isLoading && !roleTabs.includes("developer")) {
      router.push(basicUserInfo);
    }
  }, [roleTabs, router, basicUserInfo, existingUserUuid, userUuidFromUrl]);

  return (
    <section className="space-y-4 rounded-lg border border-gray-200 bg-white p-4">
      <div>
        <h2 className="text-lg font-semibold text-gray-900">Developer</h2>
        <p className="text-sm text-gray-600">
          This role grants access to manage the product roadmap.
        </p>
      </div>

      <div className="rounded-md border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">
        <p className="font-semibold">Developer capabilities</p>
        <p>
          Developers can create and manage quarters, sprints, and tasks on the roadmap. They can
          also change task statuses, assign themselves to tasks, and promote backlog tickets into
          sprints.
        </p>
      </div>

      <div className="flex items-start gap-3 pt-1">
        <input
          id="auto-subscribe"
          type="checkbox"
          checked={autoSubscribeToNewTickets}
          onChange={(e) => setField("autoSubscribeToNewTickets", e.target.checked)}
          className="mt-0.5 h-4 w-4 cursor-pointer rounded border-gray-300 text-darkBlue"
        />
        <label htmlFor="auto-subscribe" className="cursor-pointer text-sm text-gray-700">
          <span className="font-medium">Auto-subscribe to new backlog tickets</span>
          <p className="text-xs text-gray-500 mt-0.5">
            When enabled, this developer will automatically be subscribed to every new backlog
            ticket when it is created.
          </p>
        </label>
      </div>
    </section>
  );
}
