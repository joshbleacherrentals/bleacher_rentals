import {
  corsPreflightResponse,
  protectedResourceResponse,
} from "@/features/analyticsMcp/server/oauthMetadata";

// The path-specific address (RFC 9728) for the resource /api/mcp; same answer as the root one.
export const dynamic = "force-dynamic";

export const GET = (req: Request) => protectedResourceResponse(req);
export const OPTIONS = () => corsPreflightResponse();
