import { createRemoteJWKSet, jwtVerify, type JWTPayload } from "jose";

const JWKS_CACHE_TTL_MS = 5 * 60 * 1000;
const GOOGLE_IAP_JWKS_URL = new URL("https://www.gstatic.com/iap/verify/public_key-jwk");
const GOOGLE_ID_TOKEN_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");

const googleIapJwks = createRemoteJWKSet(GOOGLE_IAP_JWKS_URL, {
  cacheMaxAge: JWKS_CACHE_TTL_MS,
});
const googleIdTokenJwks = createRemoteJWKSet(GOOGLE_ID_TOKEN_JWKS_URL, {
  cacheMaxAge: JWKS_CACHE_TTL_MS,
});

export type VerifiedGoogleIdentity = {
  email: string;
  sub: string;
  name: string | null;
  picture: string | null;
  nonce: string | null;
  payload: JWTPayload;
};

function normalizeEmail(payload: Record<string, unknown>) {
  const email = typeof payload.email === "string" ? payload.email.trim().toLowerCase() : "";
  return email.length > 0 ? email : null;
}

function normalizeStringClaim(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function buildVerifiedIdentity(payload: JWTPayload, expectedNonce?: string | null): VerifiedGoogleIdentity {
  const payloadRecord = payload as Record<string, unknown>;
  const email = normalizeEmail(payloadRecord);
  const sub = normalizeStringClaim(payloadRecord.sub);
  const nonce = normalizeStringClaim(payloadRecord.nonce);

  if (!email || !sub) {
    throw new Error("Google token verification failed");
  }

  if (expectedNonce && nonce !== expectedNonce) {
    throw new Error("Google token verification failed");
  }

  const emailVerified = payloadRecord.email_verified;
  if (typeof emailVerified === "boolean" && !emailVerified) {
    throw new Error("Google token verification failed");
  }

  return {
    email,
    sub,
    name: normalizeStringClaim(payloadRecord.name),
    picture: normalizeStringClaim(payloadRecord.picture),
    nonce,
    payload,
  };
}

function getIapVerifier(keyResolver?: Parameters<typeof jwtVerify>[1]) {
  return keyResolver ?? googleIapJwks;
}

function getGoogleIdTokenVerifier(keyResolver?: Parameters<typeof jwtVerify>[1]) {
  return keyResolver ?? googleIdTokenJwks;
}

export async function verifyGoogleIapJwtAssertion(
  iapJwt: string,
  expectedAudience: string,
  options?: {
    getKey?: Parameters<typeof jwtVerify>[1];
  },
): Promise<VerifiedGoogleIdentity> {
  try {
    const { payload } = await jwtVerify(iapJwt, getIapVerifier(options?.getKey), {
      audience: expectedAudience,
      issuer: "https://cloud.google.com/iap",
    });

    return buildVerifiedIdentity(payload);
  } catch (error) {
    console.warn("[auth/iap] JWT validation failed", {
      audience: expectedAudience,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw new Error("IAP validation failed");
  }
}

export async function verifyGoogleIdToken(
  idToken: string,
  expectedAudience: string,
  options?: {
    expectedNonce?: string | null;
    getKey?: Parameters<typeof jwtVerify>[1];
  },
): Promise<VerifiedGoogleIdentity> {
  try {
    const { payload } = await jwtVerify(idToken, getGoogleIdTokenVerifier(options?.getKey), {
      audience: expectedAudience,
      issuer: ["https://accounts.google.com", "accounts.google.com"],
    });

    return buildVerifiedIdentity(payload, options?.expectedNonce);
  } catch (error) {
    console.warn("[auth/google] ID token validation failed", {
      audience: expectedAudience,
      reason: error instanceof Error ? error.message : "unknown",
    });
    throw new Error("Google token verification failed");
  }
}
