import { handleMcpRequest } from "@/features/analyticsMcp/server/handleMcpRequest";
import { buildMcpDeps } from "@/features/analyticsMcp/server/mcpDeps";

// docs/specs/analytics-mcp.md §6. node-pg needs the Node runtime. src/proxy.ts lets this path
// through without a Clerk session because the route checks the OAuth token itself.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const handler = (req: Request) => handleMcpRequest(req, buildMcpDeps(req));

// GET and DELETE are answered 405 by the handler: the server is stateless.
export { handler as GET, handler as POST, handler as DELETE };
