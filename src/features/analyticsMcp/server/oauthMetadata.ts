// Discovery documents for the MCP sign-in (docs/specs/analytics-mcp.md §6). Clerk is the
// authorization server; these only point Claude at it.

const CORS = { "access-control-allow-origin": "*" };

/**
 * The address the client used to reach us. Behind a tunnel or proxy, Next reports its own host
 * (localhost:3000) in req.url, so the forwarded headers come first. Claude checks that the resource
 * address in the discovery page is the address it connected to.
 */
export function publicOrigin(req: Request): string {
  const first = (v: string | null) => v?.split(",")[0].trim() || null;
  const url = new URL(req.url);
  const host =
    first(req.headers.get("x-forwarded-host")) ?? first(req.headers.get("host")) ?? url.host;
  const proto = first(req.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  return `${proto}://${host}`;
}

/** Clerk's frontend API URL, which is the base64 of "<host>$" after the key's pk_test_/pk_live_. */
export function clerkFrontendApiUrl(publishableKey: string): string {
  const encoded = publishableKey.replace(/^pk_(test|live)_/, "");
  const host = Buffer.from(encoded, "base64").toString("utf8").replace(/\$$/, "");
  return `https://${host}`;
}

export function protectedResourceMetadata(origin: string, frontendApiUrl: string) {
  return {
    resource: `${origin}/api/mcp`,
    authorization_servers: [frontendApiUrl],
    bearer_methods_supported: ["header"],
    resource_name: "Bleacher Rentals analytics",
  };
}

function frontendApi(): string {
  return clerkFrontendApiUrl(process.env.NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ?? "");
}

export function protectedResourceResponse(req: Request): Response {
  return Response.json(protectedResourceMetadata(publicOrigin(req), frontendApi()), {
    headers: CORS,
  });
}

/** Clerk's own authorization-server metadata, passed through for clients that ask this host. */
export async function authServerMetadataResponse(): Promise<Response> {
  const upstream = await fetch(`${frontendApi()}/.well-known/oauth-authorization-server`, {
    next: { revalidate: 3600 },
  });
  if (!upstream.ok) {
    return Response.json(
      { error: "Authorization server metadata unavailable" },
      { status: 502, headers: CORS },
    );
  }
  return Response.json(await upstream.json(), { headers: CORS });
}

export function corsPreflightResponse(): Response {
  return new Response(null, {
    status: 204,
    headers: {
      ...CORS,
      "access-control-allow-methods": "GET, OPTIONS",
      "access-control-allow-headers": "*",
    },
  });
}
