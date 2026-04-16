import { headers } from "next/headers";
import { AUTHORIZED_EMAIL_DOMAIN, env } from "@/shared/config/env";
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
