// middleware.js — minimal & deploy-safe
import { NextResponse } from "next/server";

export const config = {
  matcher: [
    "/admin/:path*",
    "/saved-cars/:path*",
    "/reservations/:path*",
    "/(api|trpc)(.*)",
  ],
};

export default function proxy(req) {
  // lightweight presence check — detects any session cookie
  // NOTE: this only checks for cookie presence, not token validity.
  const cookies = req.headers.get("cookie") || "";
  const hasSessionCookie = /session|__session|__clerk/.test(cookies);

  if (!hasSessionCookie && req.nextUrl.pathname.startsWith("/admin")) {
    return NextResponse.redirect(new URL("/sign-in", req.url));
  }

  return NextResponse.next();
}
