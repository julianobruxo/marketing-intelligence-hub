import { NextResponse } from "next/server";
import { SignJWT, decodeJwt } from "jose";
import { getPrisma } from "@/shared/lib/prisma";
import { persistGoogleConnectionForUser } from "@/modules/auth/application/google-connection-service";

type GoogleTokenResponse = {
  access_token?: string;
  refresh_token?: string;
  scope?: string;
  expires_in?: number;
  token_type?: string;
  id_token?: string;
};

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  console.info("[auth/google/callback] callback reached", {
    hasCode: Boolean(code),
    errorPresent: Boolean(error),
  });
  
  if (error) {
    console.warn("[auth/google/callback] callback rejected before token exchange", {
      reason: error,
      sessionCreated: false,
    });
    return NextResponse.redirect(new URL(`/login?error=${encodeURIComponent(error)}`, request.url));
  }

  if (!code) {
    return NextResponse.redirect(new URL(`/login?error=No_code_provided`, request.url));
  }

  const NEXTAUTH_URL = process.env.NEXTAUTH_URL ?? "http://localhost:3000";
  const redirectUri = `${NEXTAUTH_URL}/api/auth/google/callback`;

  // 1. Exchange code for token
  const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  if (!tokenResponse.ok) {
    const text = await tokenResponse.text();
    console.error("Google Token Exchange Error:", text);
    return NextResponse.redirect(new URL(`/login?error=Token_exchange_failed`, request.url));
  }

  const tokens = (await tokenResponse.json()) as GoogleTokenResponse;
  const idToken = tokens.id_token;

  if (!idToken) {
    return NextResponse.redirect(new URL(`/login?error=No_identity_token`, request.url));
  }

  // 2. Decode JWT and extract email
  // (We use decodeJwt since we implicitly trust the token just received directly from Google via TLS,
  // but verifying the signature against Google certs is best practice in prod)
  const decoded = decodeJwt(idToken);
  const email = decoded.email as string | undefined;
  const googleSub = decoded.sub as string | undefined;

  console.info("[auth/google/callback] google identity resolved", {
    email,
    hasSub: Boolean(googleSub),
  });

  if (!email || !googleSub) {
    console.warn("[auth/google/callback] callback rejected because identity payload was incomplete", {
      sessionCreated: false,
    });
    return NextResponse.redirect(new URL(`/login?error=No_email_provided`, request.url));
  }

  // 3. Domain Restriction
  if (!email.endsWith("@zazmic.com")) {
    console.warn("[auth/google/callback] google identity rejected for domain", {
      email,
      domainAccepted: false,
      sessionCreated: false,
    });
    return NextResponse.redirect(
      new URL(
        `/login?error=${encodeURIComponent(
          "Google sign-in succeeded, but this app only allows @zazmic.com accounts. Please sign in with your Zazmic Google account.",
        )}`,
        request.url,
      ),
    );
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
    return NextResponse.redirect(new URL(`/login?error=Your+account+is+not+provisioned+in+the+system.+Contact+an+administrator.`, request.url));
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
  const secretBytes = new TextEncoder().encode(process.env.NEXTAUTH_SECRET ?? "default-local-secret-for-dev");
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

  console.info("[auth/google/callback] session created", {
    email,
    domainAccepted: true,
    sessionCreated: true,
  });

  return response;
}
