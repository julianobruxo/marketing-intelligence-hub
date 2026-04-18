import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { MIH_SESSION_COOKIE_NAME, verifyMihSessionCookie } from "@/modules/auth/application/session-cookie";

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

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/ingestion/content-items") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/login") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const email = normalizeGoogleEmail(
    request.headers.get("x-goog-authenticated-user-email"),
  );
  const mihSession = request.cookies.get(MIH_SESSION_COOKIE_NAME)?.value;
  const devEmail =
    process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_EMAIL?.toLowerCase() : null;

  if (isAuthorizedZazmicEmail(email) || isAuthorizedZazmicEmail(devEmail ?? null)) {
    return NextResponse.next();
  }

  if (mihSession) {
    const verifiedSession = await verifyMihSessionCookie(mihSession);
    if (verifiedSession) {
      return NextResponse.next();
    }
  }

  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: ["/((?!.*\\.).*)"],
};
