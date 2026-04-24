import { NextResponse } from "next/server";
import { SignJWT } from "jose";
import { env } from "@/shared/config/env";
import { getPrisma } from "@/shared/lib/prisma";
import { persistGoogleConnectionForUser } from "@/modules/auth/application/google-connection-service";
import { verifyGoogleIdToken } from "@/modules/auth/infrastructure/google-jwt-verifier";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
};

const GOOGLE_OAUTH_STATE_COOKIE = "mih_google_oauth_state";
const GOOGLE_OAUTH_NONCE_COOKIE = "mih_google_oauth_nonce";

function getCookieValue(cookieHeader: string | null, name: string) {
  if (!cookieHeader) {
    return null;
  }

  const pair = cookieHeader
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));

  if (!pair) {
    return null;
  }

  const value = pair.slice(name.length + 1).trim();
  return value.length > 0 ? decodeURIComponent(value) : null;
}

function clearOAuthCookies(response: NextResponse) {
  response.cookies.delete(GOOGLE_OAUTH_STATE_COOKIE);
  response.cookies.delete(GOOGLE_OAUTH_NONCE_COOKIE);
}

function buildAuthBaseUrl(request: Request) {
  return env.NEXTAUTH_URL ?? new URL(request.url).origin;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  const returnedState = searchParams.get("state");
  const stateCookie = getCookieValue(request.headers.get("cookie"), GOOGLE_OAUTH_STATE_COOKIE);
  const nonceCookie = getCookieValue(request.headers.get("cookie"), GOOGLE_OAUTH_NONCE_COOKIE);
  console.info("[auth/google/callback] callback reached", {
    hasCode: Boolean(code),
    errorPresent: Boolean(error),
  });
  
  if (error) {
    console.warn("[auth/google/callback] callback rejected before token exchange", {
      reason: error,
      sessionCreated: false,
    });
    const response = NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  if (!returnedState || !stateCookie || returnedState !== stateCookie) {
    console.warn("[auth/google/callback] callback rejected because state validation failed", {
      hasReturnedState: Boolean(returnedState),
      hasStateCookie: Boolean(stateCookie),
      sessionCreated: false,
    });
    const response = NextResponse.redirect(new URL(`/login?error=OAuth_state_mismatch`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  if (!nonceCookie) {
    console.warn("[auth/google/callback] callback rejected because nonce cookie was missing", {
      sessionCreated: false,
    });
    const response = NextResponse.redirect(new URL(`/login?error=OAuth_nonce_missing`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  if (!code) {
    const response = NextResponse.redirect(new URL(`/login?error=No_code_provided`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  if (!env.GOOGLE_CLIENT_ID || !env.GOOGLE_CLIENT_SECRET) {
    const response = NextResponse.redirect(new URL(`/login?error=Google_OAuth_is_not_configured_on_this_server`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  const redirectUri = `${buildAuthBaseUrl(request)}/api/auth/google/callback`;

  // 1. Exchange code for token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: env.GOOGLE_CLIENT_ID,
      client_secret: env.GOOGLE_CLIENT_SECRET,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    console.error("Google Token Exchange Error:", text);
    const response = NextResponse.redirect(new URL(`/login?error=Token_exchange_failed`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  const idToken = tokens.id_token;

  if (!idToken) {
    const response = NextResponse.redirect(new URL(`/login?error=No_identity_token`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  // 2. Verify JWT and extract email
  const verifiedIdentity = await verifyGoogleIdToken(idToken, env.GOOGLE_CLIENT_ID, {
    expectedNonce: nonceCookie,
  });
  const email = verifiedIdentity.email;
  const googleSub = verifiedIdentity.sub;

  console.info("[auth/google/callback] google identity resolved", {
    email,
    hasSub: Boolean(googleSub),
  });

  if (!email || !googleSub) {
    console.warn("[auth/google/callback] callback rejected because identity payload was incomplete", {
      sessionCreated: false,
    });
    const response = NextResponse.redirect(new URL(`/login?error=No_email_provided`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  // 3. Domain Restriction
  if (!email.endsWith("@zazmic.com")) {
    console.warn("[auth/google/callback] google identity rejected for domain", {
      email,
      domainAccepted: false,
      sessionCreated: false,
    });
    const response = NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          "Google sign-in succeeded, but this app only allows @zazmic.com accounts. Please sign in with your Zazmic Google account.",
        )}`,
        request.url,
      ),
    );
    clearOAuthCookies(response);
    return response;
  }

  // 4. Provision Check
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    console.warn("[auth/google/callback] google identity accepted but user was not provisioned", {
      email,
      domainAccepted: true,
      sessionCreated: false,
    });
    const response = NextResponse.redirect(new URL(`/login?error=Your+account+is+not+provisioned+in+the+system.+Contact+an+administrator.`, request.url));
    clearOAuthCookies(response);
    return response;
  }

  const expiresAt =
    typeof tokens.expires_in === "number" && Number.isFinite(tokens.expires_in)
      ? new Date(Date.now() + tokens.expires_in * 1000)
      : null;

  await persistGoogleConnectionForUser({
    userId: user.id,
    googleSub,
    googleEmail: email,
    accessToken: tokens.access_token ?? null,
    refreshToken: tokens.refresh_token ?? null,
    scope: tokens.scope ?? null,
    expiresAt,
  });

  // 5. Establish robust Session Cookie
  const secretBytes = new TextEncoder().encode(env.NEXTAUTH_SECRET);
  const sessionToken = await new SignJWT({ email, sub: user.id })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(secretBytes);

  const response = NextResponse.redirect(new URL("/queue", request.url));
  response.cookies.set("mih_session", sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60, // 7 days
  });
  clearOAuthCookies(response);

  console.info("[auth/google/callback] session created", {
    email,
    domainAccepted: true,
    sessionCreated: true,
  });

  return response;
}
