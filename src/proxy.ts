import { clerkMiddleware } from "@clerk/nextjs/server";

const AUDIT_API_PATHS = new Set(["/api/chat", "/api/grc-chat", "/api/infer", "/api/assess", "/api/redline", "/api/draft", "/api/audit-notify"]);

export default clerkMiddleware(async (_auth, req) => {
  // Sprint-1 audit runner authenticates via x-audit-secret; route handlers validate it.
  if (AUDIT_API_PATHS.has(req.nextUrl.pathname) && req.headers.get("x-audit-secret")) {
    return;
  }
});

export const config = {
  matcher: [
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    "/__clerk/:path*",
    "/(api|trpc)(.*)",
  ],
};
