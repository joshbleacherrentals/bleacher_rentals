"use client";

import { useUserAccess } from "@/features/userAccess/hooks/useUserAccess";
import { useCurrentSprint } from "../hooks/useSprints";
import { GoToCurrentSprintLink } from "./GoToCurrentSprintLink";

function DeveloperSprintLink() {
  const sprint = useCurrentSprint();
  return <GoToCurrentSprintLink roles={["developer"]} sprint={sprint} />;
}

/** Only developers pay for the sprint query. */
export function CurrentSprintHeaderLink() {
  const access = useUserAccess();
  if (access.status !== "active" || !access.roles.includes("developer")) return null;
  return <DeveloperSprintLink />;
}
