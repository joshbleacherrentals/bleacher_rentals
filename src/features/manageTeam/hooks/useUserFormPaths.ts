import { useCurrentUserStore } from "../state/useCurrentUserStore";
import { useParams } from "next/navigation";

export function useUserFormPaths() {
  const params = useParams();
  const existingUserUuid = useCurrentUserStore((s) => s.existingUserUuid);
  const userUuid = (params?.userUuid as string) || existingUserUuid;

  const isEditMode = !!userUuid;
  const basePath = isEditMode ? `/team/${userUuid}/edit` : "/team/new";

  return {
    basePath,
    isEditMode,
    userUuid,
    basicUserInfo: `${basePath}/basic-user-info`,
    driver: `${basePath}/driver`,
    accountManager: `${basePath}/account-manager`,
    administrator: `${basePath}/administrator`,
    developer: `${basePath}/developer`,
  };
}
