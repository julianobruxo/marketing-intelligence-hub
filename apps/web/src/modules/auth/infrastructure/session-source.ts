import { headers, cookies } from "next/headers";
import { AUTHORIZED_EMAIL_DOMAIN, env } from "@/shared/config/env";
import { MIH_SESSION_COOKIE_NAME, verifyMihSessionCookie } from "../application/session-cookie";
import type { UserSession } from "../domain/session";

function normalizeGoogleEmail(rawValue: string | null) {
  if (!rawValue) {
    return null;
  }

  const normalized = rawValue.includes(":") ? rawValue.split(":").at(-1) : rawValue;
  return normalized?.trim().toLowerCase() ?? null;
}

function isAuthorizedDomain(email: string) {
  return email.endsWith(`@${AUTHORIZED_EMAIL_DOMAIN}`);
}

export async function getRequestIdentity(): Promise<UserSession | null> {
  const requestHeaders = await headers();
  const iapEmail = normalizeGoogleEmail(
    requestHeaders.get("x-goog-authenticated-user-email"),
  );

  if (iapEmail && isAuthorizedDomain(iapEmail)) {
    return {
      email: iapEmail,
      roles: [],
      mode: "iap",
    };
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
