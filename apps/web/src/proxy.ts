import type { NextRequest } from "next/server";
import { NextResponse } from "next/server";
import { env } from "@/shared/config/env";
import { verifyGoogleIapJwtAssertion } from "@/modules/auth/infrastructure/google-jwt-verifier";
import { MIH_SESSION_COOKIE_NAME, verifyMihSessionCookie } from "@/modules/auth/application/session-cookie";

function isAuthorizedZazmicEmail(email: string | null) {
  return Boolean(email?.endsWith("@zazmic.com"));
}

export async function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api/health") ||
    pathname.startsWith("/api/test") ||
    pathname.startsWith("/api/test-db") ||
    pathname.startsWith("/api/auth/mock-login") ||
    pathname.startsWith("/api/ingestion/content-items") ||
    pathname.startsWith("/api/auth/google") ||
    pathname.startsWith("/login") ||
    pathname === "/favicon.ico"
  ) {
    return NextResponse.next();
  }

  const iapAudience = env.IAP_AUDIENCE?.trim();
  const mihSession = request.cookies.get(MIH_SESSION_COOKIE_NAME)?.value;
  const devEmail =
    process.env.NODE_ENV !== "production" ? process.env.DEV_AUTH_EMAIL?.toLowerCase() : null;

  if (iapAudience) {
    const iapJwt = request.headers.get("x-goog-iap-jwt-assertion");

    if (!iapJwt) {
      console.warn("[proxy] blocked request without IAP assertion", { pathname });
      return NextResponse.redirect(new URL("/login", request.url));
    }

    try {
      const verifiedIap = await verifyGoogleIapJwtAssertion(iapJwt, iapAudience);
      if (!isAuthorizedZazmicEmail(verifiedIap.email)) {
        console.warn("[proxy] blocked request for unauthorized email", {
          pathname,
          email: verifiedIap.email,
        });
        return NextResponse.redirect(new URL("/login", request.url));
      }

      return NextResponse.next();
    } catch (error) {
      console.warn("[proxy] blocked request after IAP validation failure", {
        pathname,
        reason: error instanceof Error ? error.message : "unknown",
      });
      return NextResponse.redirect(new URL("/login", request.url));
    }
  }

  if (isAuthorizedZazmicEmail(devEmail ?? null)) {
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
