import { jwtVerify } from "jose";
import { AUTHORIZED_EMAIL_DOMAIN } from "@/shared/config/env";

export const MIH_SESSION_COOKIE_NAME = "mih_session";

export type VerifiedMihSession = {
  email: string;
  sub: string | null;
};

function getSessionSecretBytes() {
  return new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "default-local-secret-for-dev");
}

function isAuthorizedDomain(email: string) {
  return email.endsWith(`@${AUTHORIZED_EMAIL_DOMAIN}`);
}

export async function verifyMihSessionCookie(value: string | undefined | null): Promise<VerifiedMihSession | null> {
  if (!value) {
    return null;
  }

  try {
    const { payload } = await jwtVerify(value, getSessionSecretBytes());
    const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : null;
    const sub = typeof payload.sub === "string" ? payload.sub : null;

    if (!email || !isAuthorizedDomain(email)) {
      return null;
    }

    return {
      email,
      sub,
    };
  } catch {
    return null;
  }
}
