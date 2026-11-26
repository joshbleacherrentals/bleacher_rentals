import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isPathAllowed, type MergedAccessConfig } from "../accessConfig";

export function useAccessRedirect(config: MergedAccessConfig | null) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!config) return;

    const isAllowed = isPathAllowed(config, pathname);
    if (!isAllowed) {
      router.replace(config.defaultRedirect);
    }
  }, [config, pathname, router]);
}
