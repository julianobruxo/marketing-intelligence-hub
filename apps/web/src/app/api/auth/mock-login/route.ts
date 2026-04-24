import { SignJWT } from "jose";
import { NextRequest, NextResponse } from "next/server";
import { MIH_SESSION_COOKIE_NAME } from "@/modules/auth/application/session-cookie";
import { ensureTestUserWithRoles, type TestUserRole } from "@/modules/testing/e2e-seed";
import { env } from "@/shared/config/env";

function isMockLoginEnabled() {
  return process.env.NODE_ENV !== "production";
}

function resolveRole(request: NextRequest): TestUserRole {
  return request.nextUrl.searchParams.get("role") === "admin" ? "admin" : "user";
}

export async function GET(request: NextRequest) {
  if (!isMockLoginEnabled()) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const role = resolveRole(request);
  const user = await ensureTestUserWithRoles(role);

  const sessionToken = await new SignJWT({ email: user.email, sub: user.id })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setIssuedAt()
    .setExpirationTime("7d")
    .sign(new TextEncoder().encode(env.NEXTAUTH_SECRET));

  const response = NextResponse.redirect(new URL("/queue", request.url));
  response.cookies.set(MIH_SESSION_COOKIE_NAME, sessionToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60,
  });

  return response;
}
