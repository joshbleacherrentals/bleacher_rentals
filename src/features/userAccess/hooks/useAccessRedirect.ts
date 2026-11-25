import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import type { MergedAccessConfig } from "../accessConfig";
import { pathMatches } from "../logic/pathMatches";

export function useAccessRedirect(config: MergedAccessConfig | null) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!config) return;

    const isAllowed = config.allowedPaths.some((p) => pathMatches(p, pathname));
    if (!isAllowed) {
      router.replace(config.defaultRedirect);
    }
  }, [config, pathname, router]);
}
