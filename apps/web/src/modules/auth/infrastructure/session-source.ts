import { headers, cookies } from "next/headers";
import { AUTHORIZED_EMAIL_DOMAIN, env } from "@/shared/config/env";
import { MIH_SESSION_COOKIE_NAME, verifyMihSessionCookie } from "../application/session-cookie";
import type { UserSession } from "../domain/session";
import { verifyGoogleIapJwtAssertion } from "./google-jwt-verifier";

function isAuthorizedDomain(email: string) {
  return email.endsWith(`@${AUTHORIZED_EMAIL_DOMAIN}`);
}

export async function getRequestIdentity(): Promise<UserSession | null> {
  const requestHeaders = await headers();
  const iapAudience = env.IAP_AUDIENCE?.trim();

  if (iapAudience) {
    const iapJwt = requestHeaders.get("x-goog-iap-jwt-assertion");
    if (!iapJwt) {
      console.warn("[auth/session-source] missing IAP assertion");
      return null;
    }

    try {
      const verifiedIap = await verifyGoogleIapJwtAssertion(iapJwt, iapAudience);
      if (!isAuthorizedDomain(verifiedIap.email)) {
        return null;
      }

      return {
        email: verifiedIap.email,
        roles: [],
        mode: "iap",
      };
    } catch (error) {
      console.warn("[auth/session-source] IAP identity rejected", {
        reason: error instanceof Error ? error.message : "unknown",
      });
      return null;
    }
  }

  const cookieStore = await cookies();
  const mihSession = cookieStore.get(MIH_SESSION_COOKIE_NAME)?.value;
  const verifiedSession = await verifyMihSessionCookie(mihSession);

  if (verifiedSession) {
    return {
      email: verifiedSession.email,
      roles: [],
      mode: "cookie",
    };
  }

  if (
    process.env.NODE_ENV !== "production" &&
    env.DEV_AUTH_EMAIL &&
    isAuthorizedDomain(env.DEV_AUTH_EMAIL)
  ) {
    return {
      email: env.DEV_AUTH_EMAIL.toLowerCase(),
      roles: [],
      mode: "development",
    };
  }

  return null;
}
