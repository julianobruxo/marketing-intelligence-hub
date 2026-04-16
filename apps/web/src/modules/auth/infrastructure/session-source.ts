import { headers, cookies } from "next/headers";
import { jwtVerify } from "jose";
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

  const cookieStore = await cookies();
  const mihSession = cookieStore.get("mih_session")?.value;

  if (mihSession) {
    try {
      const secretBytes = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "default-local-secret-for-dev");
      const { payload } = await jwtVerify(mihSession, secretBytes);
      if (payload.email && isAuthorizedDomain(payload.email as string)) {
        return {
          email: payload.email as string,
          roles: [],
          mode: "cookie",
        };
      }
    } catch {
      // Intentionally ignore decryption errors yielding null eventually resolving into 401s naturally
    }
  }

  if (
    process.env.NODE_ENV !== "production" &&
    !process.env.GOOGLE_CLIENT_ID &&
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
