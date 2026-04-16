import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";

function normalizeGoogleEmail(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  return rawValue.includes(":")
    ? rawValue.split(":").at(-1)?.toLowerCase() ?? null
    : rawValue.toLowerCase();
}

function isAuthorizedZazmicEmail(email: string | null) {
  return Boolean(email?.endsWith("@zazmic.com"));
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/ingestion/content-items") ||
    pathname.startsWith("/login") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const email = normalizeGoogleEmail(
    request.headers.get("x-goog-authenticated-user-email"),
  );
  const devEmail =
    process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_EMAIL?.toLowerCase() : null;

  if (isAuthorizedZazmicEmail(email) || isAuthorizedZazmicEmail(devEmail ?? null)) {
    return NextResponse.next();
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
