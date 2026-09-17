import Link from "next/link";
import type { WebRole } from "@/features/userAccess/logic/determineAccess";

type Props = {
  roles: WebRole[];
  sprint: { id: string; quarter_id: string | null } | null;
};

/** Header shortcut for developers into the sprint that is running right now. */
export function GoToCurrentSprintLink({ roles, sprint }: Props) {
  if (!roles.includes("developer") || !sprint?.quarter_id) return null;

  return (
    <Link
      href={`/roadmap/${sprint.quarter_id}/sprint/${sprint.id}`}
      className="mr-2 rounded py-1 text-sm text-white/70 hover:text-white hover:underline transition-all duration-300"
    >
      Go to current sprint
    </Link>
  );
}
