import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

function setProcessEnv(overrides: Record<string, string | undefined>) {
  const previous = new Map<string, string | undefined>();

  for (const [key, value] of Object.entries(overrides)) {
    previous.set(key, process.env[key]);

    if (value === undefined) {
      delete process.env[key];
    } else {
      process.env[key] = value;
    }
  }

  return () => {
    for (const [key, value] of previous.entries()) {
      if (value === undefined) {
        delete process.env[key];
      } else {
        process.env[key] = value;
      }
    }
  };
}

async function importService() {
  vi.resetModules();
  return import("@/modules/auth/application/google-connection-service");
}

describe("google connection service", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock: ReturnType<typeof vi.fn>;
  let restoreEnv: (() => void) | null = null;

  beforeEach(() => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      NEXTAUTH_URL: "http://localhost:3000",
      ENCRYPTION_KEY: "unit-test-encryption-key",
      DRIVE_PROVIDER_MODE: "MOCK",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    });

    fetchMock = vi.fn();
    globalThis.fetch = fetchMock as typeof fetch;
    prismaMocks.getPrisma.mockReset();
  });

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    globalThis.fetch = originalFetch;
    vi.resetModules();
  });

  it("returns the current access token when it is not expired", async () => {
    const prisma = {
      googleConnection: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          active: true,
          scope:
            "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
          accessToken: "live-token",
          accessTokenEncrypted: null,
          refreshToken: "refresh-token",
          refreshTokenEncrypted: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma as never);

    const { getValidAccessToken } = await importService();
    const token = await getValidAccessToken("user-1");

    expect(token).toBe("live-token");
    expect(fetchMock).not.toHaveBeenCalled();
    expect(prisma.googleConnection.update).not.toHaveBeenCalled();
  });

  it("refreshes an expired access token and persists the encrypted replacement", async () => {
    const prisma = {
      googleConnection: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          active: true,
          scope:
            "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
          accessToken: "old-token",
          accessTokenEncrypted: null,
          refreshToken: "refresh-token",
          refreshTokenEncrypted: null,
          expiresAt: new Date(Date.now() - 60_000),
        }),
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma as never);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          access_token: "refreshed-token",
          expires_in: 3600,
          token_type: "Bearer",
        }),
        {
          status: 200,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const { decryptSensitive } = await import("@/shared/lib/encryption");
    const { getValidAccessToken } = await importService();
    const token = await getValidAccessToken("user-1");

    expect(token).toBe("refreshed-token");
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(prisma.googleConnection.update).toHaveBeenCalledTimes(1);

    const updateArg = vi.mocked(prisma.googleConnection.update).mock.calls[0]?.[0];
    expect(updateArg?.data).toMatchObject({
      accessToken: "",
      expiresAt: expect.any(Date),
      encryptionVersion: 1,
    });
    expect(typeof updateArg?.data.accessTokenEncrypted).toBe("string");
    expect(decryptSensitive(String(updateArg?.data.accessTokenEncrypted))).toBe("refreshed-token");
  });

  it("throws a clear error when the refresh flow fails", async () => {
    const prisma = {
      googleConnection: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          active: true,
          scope:
            "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
          accessToken: "old-token",
          accessTokenEncrypted: null,
          refreshToken: "refresh-token",
          refreshTokenEncrypted: null,
          expiresAt: new Date(Date.now() - 60_000),
        }),
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma as never);

    fetchMock.mockResolvedValueOnce(
      new Response(
        JSON.stringify({
          error: "invalid_grant",
          error_description: "The refresh token is no longer valid.",
        }),
        {
          status: 400,
          headers: {
            "content-type": "application/json",
          },
        },
      ),
    );

    const { getValidAccessToken } = await importService();

    await expect(getValidAccessToken("user-1")).rejects.toMatchObject({
      name: "GoogleConnectionAccessError",
      code: "GOOGLE_TOKEN_REFRESH_FAILED",
    });
  });

  it("throws when the connected account is missing a required scope", async () => {
    const prisma = {
      googleConnection: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          active: true,
          scope: "https://www.googleapis.com/auth/drive.readonly",
          accessToken: "live-token",
          accessTokenEncrypted: null,
          refreshToken: "refresh-token",
          refreshTokenEncrypted: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma as never);

    const { getValidAccessToken } = await importService();

    await expect(getValidAccessToken("user-1")).rejects.toMatchObject({
      name: "InsufficientScopesError",
      code: "INSUFFICIENT_GOOGLE_SCOPES",
    });

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("accepts a connection with both required scopes", async () => {
    const prisma = {
      googleConnection: {
        findUnique: vi.fn().mockResolvedValue({
          userId: "user-1",
          active: true,
          scope:
            "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
          accessToken: "live-token",
          accessTokenEncrypted: null,
          refreshToken: "refresh-token",
          refreshTokenEncrypted: null,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000),
        }),
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma as never);

    const { validateGoogleConnectionScopes } = await importService();

    await expect(
      validateGoogleConnectionScopes({
        scope:
          "https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
      }),
    ).resolves.toBeUndefined();
  });
});
