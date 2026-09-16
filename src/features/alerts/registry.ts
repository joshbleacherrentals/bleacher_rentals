import { AlertDefinition } from "./types";
import { schedulingConflict } from "./definitions/schedulingConflict";
import { eventRequirements } from "./definitions/eventRequirements";
import { bleacherTransportation } from "./definitions/bleacherTransportation";
import { workTrackerTransportation } from "./definitions/workTrackerTransportation";
import { workTrackerPending } from "./definitions/workTrackerPending";
// Review-request alerts disabled per boss feedback — kept for future use
// import { reviewRequestedWorkTracker } from "./definitions/reviewRequestedWorkTracker";
// import { reviewRequestedQuote } from "./definitions/reviewRequestedQuote";

export const alertDefinitions: AlertDefinition[] = [
  schedulingConflict,
  eventRequirements,
  bleacherTransportation,
  workTrackerTransportation,
  workTrackerPending,
  // reviewRequestedWorkTracker,
  // reviewRequestedQuote,
];

export function getDefinitionsForEntity(entityType: string): AlertDefinition[] {
  return alertDefinitions.filter((d) => d.entityType === entityType);
}
