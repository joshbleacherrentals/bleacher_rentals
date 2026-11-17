import {
  authServerMetadataResponse,
  corsPreflightResponse,
} from "@/features/analyticsMcp/server/oauthMetadata";

// docs/specs/analytics-mcp.md §6: Clerk's own metadata, for clients that ask this host for it.
export const dynamic = "force-dynamic";

export const GET = () => authServerMetadataResponse();
export const OPTIONS = () => corsPreflightResponse();
