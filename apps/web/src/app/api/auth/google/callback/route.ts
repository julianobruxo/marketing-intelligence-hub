import { NextResponse } from "next/server";
import { SignJWT, decodeJwt } from "jose";
import { getPrisma } from "@/shared/lib/prisma";

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const error = searchParams.get("error");
  
  if (error) {
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

  const tokens = await tokenResponse.json();
  const idToken = tokens.id_token;

  if (!idToken) {
    return NextResponse.redirect(new URL(`/login?error=No_identity_token`, request.url));
  }

  // 2. Decode JWT and extract email
  // (We use decodeJwt since we implicitly trust the token just received directly from Google via TLS,
  // but verifying the signature against Google certs is best practice in prod)
  const decoded = decodeJwt(idToken);
  const email = decoded.email as string | undefined;

  if (!email) {
    return NextResponse.redirect(new URL(`/login?error=No_email_provided`, request.url));
  }

  // 3. Domain Restriction
  if (!email.endsWith("@zazmic.com")) {
    return NextResponse.redirect(new URL(`/login?error=Access+restricted+to+Zazmic+organization`, request.url));
  }

  // 4. Provision Check
  const prisma = getPrisma();
  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.isActive) {
    return NextResponse.redirect(new URL(`/login?error=Your+account+is+not+provisioned+in+the+system.+Contact+an+administrator.`, request.url));
  }

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

  return response;
}
