import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/api/webhooks(.*)",
  "/quote/(.*)",
  "/api/contracts/(.*)",
  "/api/quotes/(.*)/pdf",
  "/api/quotes/(.*)/activity",
  "/api/quotes/(.*)/version",
  "/api/payments/(.*)",
  "/api/stripe/(.*)",
  "/api/events/(.*)/po",
  "/api/cron/(.*)",
  // Gmail's push notifications, through Pub/Sub. It checks the subscription's signed token itself.
  "/api/gmail/push",
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest|wasm)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
  ],
};
