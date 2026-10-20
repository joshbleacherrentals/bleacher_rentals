export function canEditRoadmapTasks(
  isDeveloper: boolean,
  isAccountManager: boolean,
  isMaintainer: boolean,
): boolean {
  return isDeveloper || isAccountManager || isMaintainer;
}
