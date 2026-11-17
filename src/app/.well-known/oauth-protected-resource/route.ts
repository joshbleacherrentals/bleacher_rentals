import {
  corsPreflightResponse,
  protectedResourceResponse,
} from "@/features/analyticsMcp/server/oauthMetadata";

// docs/specs/analytics-mcp.md §6.
export const dynamic = "force-dynamic";

export const GET = (req: Request) => protectedResourceResponse(req);
export const OPTIONS = () => corsPreflightResponse();
