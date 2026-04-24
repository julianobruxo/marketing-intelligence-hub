import "server-only";

import { google } from "googleapis";
import type { GoogleConnection, Prisma } from "@prisma/client";
import { requireSession } from "./auth-service";
import { GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, env } from "@/shared/config/env";
import { getPrisma } from "@/shared/lib/prisma";
import { decryptSensitive, encryptSensitive } from "@/shared/lib/encryption";

export const GOOGLE_DRIVE_DISCOVERY_SCOPES = [
  "https://www.googleapis.com/auth/drive.readonly",
  "https://www.googleapis.com/auth/spreadsheets.readonly",
] as const;

const GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_MS = 60_000;
const GOOGLE_TOKEN_REFRESH_URL = "https://oauth2.googleapis.com/token";

export class GoogleConnectionAccessError extends Error {
  code: string;

  constructor(code: string, message: string) {
    super(message);
    this.name = "GoogleConnectionAccessError";
    this.code = code;
  }
}

export class InsufficientScopesError extends GoogleConnectionAccessError {
  missingScopes: string[];

  constructor(missingScopes: string[]) {
    super(
      "INSUFFICIENT_GOOGLE_SCOPES",
      `The connected Google account is missing the required scopes: ${missingScopes.join(", ")}`,
    );
    this.name = "InsufficientScopesError";
    this.missingScopes = missingScopes;
  }
}

export type PersistGoogleConnectionInput = {
  userId: string;
  googleSub: string;
  googleEmail: string;
  accessToken?: string | null;
  refreshToken?: string | null;
  scope?: string | null;
  expiresAt?: Date | null;
  active?: boolean;
};

function readDecryptedToken(encrypted?: string | null, plaintext?: string | null) {
  if (encrypted) {
    return decryptSensitive(encrypted);
  }

  return plaintext?.trim() || null;
}

function normalizeScopes(scope: string | null | undefined) {
  return (scope ?? "")
    .split(/\s+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function isTokenExpired(expiresAt?: Date | null) {
  if (!expiresAt) {
    return false;
  }

  return expiresAt.getTime() <= Date.now() + GOOGLE_ACCESS_TOKEN_REFRESH_SKEW_MS;
}

async function updateAccessTokenForUser(userId: string, accessToken: string, expiresIn: number) {
  const prisma = getPrisma();

  await prisma.googleConnection.update({
    where: { userId },
    data: {
      accessToken: "",
      accessTokenEncrypted: encryptSensitive(accessToken),
      expiresAt: new Date(Date.now() + expiresIn * 1000),
      encryptionVersion: 1,
    },
  });
}

export async function refreshAccessToken(refreshToken: string): Promise<{
  access_token: string;
  expires_in: number;
  scope?: string;
  token_type?: string;
}> {
  if (!GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google OAuth is not configured on this server.",
    );
  }

  const response = await fetch(GOOGLE_TOKEN_REFRESH_URL, {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
    }),
  });

  const payload = (await response.json().catch(() => null)) as
    | {
        access_token?: string;
        expires_in?: number;
        scope?: string;
        token_type?: string;
        error?: string;
        error_description?: string;
      }
    | null;

  if (!response.ok) {
    const description = payload?.error_description ?? payload?.error ?? `HTTP ${response.status}`;
    throw new GoogleConnectionAccessError(
      "GOOGLE_TOKEN_REFRESH_FAILED",
      `Failed to refresh Google access token: ${description}`,
    );
  }

  if (
    !payload ||
    typeof payload.access_token !== "string" ||
    typeof payload.expires_in !== "number"
  ) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_TOKEN_REFRESH_FAILED",
      "Google token refresh succeeded but returned an invalid payload.",
    );
  }

  return {
    access_token: payload.access_token,
    expires_in: payload.expires_in,
    scope: payload.scope,
    token_type: payload.token_type,
  };
}

export async function validateGoogleConnectionScopes(connection: Pick<GoogleConnection, "scope">) {
  const grantedScopes = normalizeScopes(connection.scope);
  const missingScopes = GOOGLE_DRIVE_DISCOVERY_SCOPES.filter((scope) => !grantedScopes.includes(scope));

  if (missingScopes.length > 0) {
    throw new InsufficientScopesError(missingScopes);
  }
}

export async function getValidAccessToken(userId: string): Promise<string> {
  const prisma = getPrisma();
  const connection = await prisma.googleConnection.findUnique({
    where: { userId },
  });

  if (!connection) {
    throw new GoogleConnectionAccessError(
      "NO_GOOGLE_CONNECTION",
      "No Google connection found for the current user.",
    );
  }

  if (!connection.active) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_CONNECTION_INACTIVE",
      "The current Google connection is inactive.",
    );
  }

  await validateGoogleConnectionScopes(connection);

  const accessToken = readDecryptedToken(connection.accessTokenEncrypted, connection.accessToken);
  const refreshToken = readDecryptedToken(connection.refreshTokenEncrypted, connection.refreshToken);
  const tokenExpired = isTokenExpired(connection.expiresAt);

  if (accessToken && !tokenExpired) {
    return accessToken;
  }

  if (!refreshToken) {
    if (accessToken) {
      throw new GoogleConnectionAccessError(
        "GOOGLE_TOKEN_REFRESH_REQUIRED",
        "The Google access token has expired and no refresh token is stored for the connection.",
      );
    }

    throw new GoogleConnectionAccessError(
      "MISSING_GOOGLE_CREDENTIALS",
      "No usable Google OAuth credentials are stored for the current user.",
    );
  }

  const refreshed = await refreshAccessToken(refreshToken);
  await updateAccessTokenForUser(userId, refreshed.access_token, refreshed.expires_in);

  return refreshed.access_token;
}

export async function persistGoogleConnectionForUser(input: PersistGoogleConnectionInput): Promise<GoogleConnection> {
  const prisma = getPrisma();
  const existingConnection = await prisma.googleConnection.findUnique({
    where: { userId: input.userId },
  });

  const nextAccessToken =
    input.accessToken?.trim() ||
    (existingConnection?.accessTokenEncrypted
      ? decryptSensitive(existingConnection.accessTokenEncrypted)
      : existingConnection?.accessToken || "") ||
    "";
  const nextRefreshToken =
    input.refreshToken?.trim() ||
    (existingConnection?.refreshTokenEncrypted
      ? decryptSensitive(existingConnection.refreshTokenEncrypted)
      : existingConnection?.refreshToken || null);

  const accessTokenEncrypted = nextAccessToken.length > 0 ? encryptSensitive(nextAccessToken) : null;
  const refreshTokenEncrypted =
    typeof nextRefreshToken === "string" && nextRefreshToken.length > 0
      ? encryptSensitive(nextRefreshToken)
      : null;

  const updateData: Prisma.GoogleConnectionUncheckedUpdateInput = {
    googleSub: input.googleSub,
    googleEmail: input.googleEmail,
    accessToken: "",
    accessTokenEncrypted,
    refreshToken: null,
    refreshTokenEncrypted,
    encryptionVersion: 1,
    active: input.active ?? true,
  };

  if (typeof input.scope === "string") {
    updateData.scope = input.scope;
  }

  if (input.expiresAt !== undefined) {
    updateData.expiresAt = input.expiresAt;
  }

  return prisma.googleConnection.upsert({
    where: { userId: input.userId },
    create: {
      userId: input.userId,
      googleSub: input.googleSub,
      googleEmail: input.googleEmail,
      accessToken: "",
      accessTokenEncrypted,
      refreshToken: null,
      refreshTokenEncrypted,
      encryptionVersion: 1,
      scope: typeof input.scope === "string" ? input.scope : null,
      expiresAt: input.expiresAt ?? null,
      active: input.active ?? true,
    },
    update: updateData,
  });
}

export async function getCurrentUserGoogleConnection() {
  const session = await requireSession();
  const prisma = getPrisma();

  const user = await prisma.user.findUnique({
    where: { email: session.email },
    include: {
      googleConnection: true,
    },
  });

  return user?.googleConnection ?? null;
}

export function buildGoogleOAuthClientForConnection(connection: GoogleConnection, accessToken?: string) {
  const clientId = GOOGLE_CLIENT_ID;
  const clientSecret = GOOGLE_CLIENT_SECRET;
  const redirectUri = `${env.NEXTAUTH_URL ?? "http://localhost:3000"}/api/auth/google/callback`;

  if (!clientId || !clientSecret) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_OAUTH_NOT_CONFIGURED",
      "Google OAuth is not configured on this server.",
    );
  }

  const nextAccessToken = accessToken ?? readDecryptedToken(connection.accessTokenEncrypted, connection.accessToken) ?? undefined;
  const refreshToken = readDecryptedToken(connection.refreshTokenEncrypted, connection.refreshToken);

  const oauthClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  oauthClient.setCredentials({
    access_token: nextAccessToken,
    refresh_token: refreshToken ?? undefined,
    scope: connection.scope || undefined,
    expiry_date: connection.expiresAt ? connection.expiresAt.getTime() : undefined,
    token_type: "Bearer",
  });

  return oauthClient;
}

export async function getCurrentUserGoogleOAuthClient() {
  const connection = await getCurrentUserGoogleConnection();

  if (!connection) {
    throw new GoogleConnectionAccessError(
      "NO_GOOGLE_CONNECTION",
      "No Google connection found for the current user.",
    );
  }

  if (!connection.active) {
    throw new GoogleConnectionAccessError(
      "GOOGLE_CONNECTION_INACTIVE",
      "The current Google connection is inactive.",
    );
  }

  const accessToken = await getValidAccessToken(connection.userId);
  const oauthClient = buildGoogleOAuthClientForConnection(connection, accessToken);

  return {
    connection,
    oauthClient,
  };
}
