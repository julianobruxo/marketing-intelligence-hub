import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const joseMocks = vi.hoisted(() => ({
  jwtVerify: vi.fn(),
  createRemoteJWKSet: vi.fn(() => ({ kind: "jwks" })),
}));

const verifierModuleMock = vi.hoisted(() => ({
  verifyGoogleIapJwtAssertion: vi.fn(),
}));

vi.mock("jose", () => ({
  createRemoteJWKSet: joseMocks.createRemoteJWKSet,
  jwtVerify: joseMocks.jwtVerify,
}));

vi.mock("@/modules/auth/infrastructure/google-jwt-verifier", () => ({
  verifyGoogleIapJwtAssertion: verifierModuleMock.verifyGoogleIapJwtAssertion,
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

async function importFreshEnv() {
  vi.resetModules();
  return import("@/shared/config/env");
}

async function importActualVerifier() {
  vi.resetModules();
  return vi.importActual<typeof import("@/modules/auth/infrastructure/google-jwt-verifier")>(
    "@/modules/auth/infrastructure/google-jwt-verifier",
  );
}

async function importProxyWithEnv() {
  vi.resetModules();
  const envModule = await import("@/shared/config/env");
  const proxyModule = await import("@/proxy");
  return { env: envModule.env, proxy: proxyModule.proxy };
}

describe("env security guardrails", () => {
  let warnSpy: ReturnType<typeof vi.spyOn> | null = null;

  beforeEach(() => {
    warnSpy = vi.spyOn(console, "warn").mockImplementation(() => undefined);
  });

  afterEach(() => {
    warnSpy?.mockRestore();
    vi.resetModules();
  });

  it("fails fast in production when NEXTAUTH_SECRET is missing", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: undefined,
    });

    await expect(importFreshEnv()).rejects.toThrow("NEXTAUTH_SECRET is required in production.");

    restore();
  });

  it("fails fast in production when NEXTAUTH_SECRET is too short", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "production",
      NEXTAUTH_SECRET: "too-short-secret",
    });

    await expect(importFreshEnv()).rejects.toThrow(
      "NEXTAUTH_SECRET must be at least 32 characters in production.",
    );

    restore();
  });

  it("falls back to the local development secret and logs a warning in development", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "development",
      NEXTAUTH_SECRET: undefined,
    });

    const { env } = await importFreshEnv();

    expect(env.NEXTAUTH_SECRET).toBe("default-local-secret-for-dev");
    expect(warnSpy).toHaveBeenCalledWith(
      "[env] NEXTAUTH_SECRET is missing. Falling back to the local development secret.",
    );

    restore();
  });
});

describe("google-jwt-verifier", () => {
  beforeEach(() => {
    joseMocks.jwtVerify.mockReset();
    joseMocks.createRemoteJWKSet.mockClear();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("verifies Google ID tokens against the Google JWKS and expected audience", async () => {
    joseMocks.jwtVerify.mockResolvedValue({
      payload: {
        email: "operator@zazmic.com",
        sub: "google-sub-123",
        name: "Operator",
        picture: "https://example.com/avatar.png",
        nonce: "nonce-123",
        email_verified: true,
      },
    });

    const { verifyGoogleIdToken } = await importActualVerifier();
    const identity = await verifyGoogleIdToken("id-token", "google-client-id", {
      expectedNonce: "nonce-123",
    });

    expect(identity.email).toBe("operator@zazmic.com");
    expect(identity.sub).toBe("google-sub-123");
    expect(joseMocks.createRemoteJWKSet).toHaveBeenCalledTimes(2);
    const jwksCalls = joseMocks.createRemoteJWKSet.mock.calls as unknown as Array<[URL]>;
    expect(jwksCalls.map(([url]) => url.toString())).toEqual([
      "https://www.gstatic.com/iap/verify/public_key-jwk",
      "https://www.googleapis.com/oauth2/v3/certs",
    ]);
    expect(joseMocks.jwtVerify).toHaveBeenCalledWith(
      "id-token",
      expect.any(Object),
      {
        audience: "google-client-id",
        issuer: ["https://accounts.google.com", "accounts.google.com"],
      },
    );
  });

  it("rejects forged Google ID tokens", async () => {
    joseMocks.jwtVerify.mockRejectedValue(new Error("signature invalid"));

    const { verifyGoogleIdToken } = await importActualVerifier();

    await expect(
      verifyGoogleIdToken("forged-token", "google-client-id", {
        expectedNonce: "nonce-123",
      }),
    ).rejects.toThrow("Google token verification failed");
  });

  it("verifies IAP assertions against the IAP JWKS and expected audience", async () => {
    joseMocks.jwtVerify.mockResolvedValue({
      payload: {
        email: "operator@zazmic.com",
        sub: "iap-sub-123",
        email_verified: true,
      },
    });

    const { verifyGoogleIapJwtAssertion } = await importActualVerifier();
    const identity = await verifyGoogleIapJwtAssertion("iap-jwt", "iap-audience");

    expect(identity.email).toBe("operator@zazmic.com");
    expect(identity.sub).toBe("iap-sub-123");
    expect(joseMocks.jwtVerify).toHaveBeenCalledWith(
      "iap-jwt",
      expect.any(Object),
      {
        audience: "iap-audience",
        issuer: "https://cloud.google.com/iap",
      },
    );
  });

  it("rejects IAP assertions that fail signature validation", async () => {
    joseMocks.jwtVerify.mockRejectedValue(new Error("invalid signature"));

    const { verifyGoogleIapJwtAssertion } = await importActualVerifier();

    await expect(verifyGoogleIapJwtAssertion("bad-iap-jwt", "iap-audience")).rejects.toThrow(
      "IAP validation failed",
    );
  });
});

describe("proxy auth gating", () => {
  beforeEach(() => {
    verifierModuleMock.verifyGoogleIapJwtAssertion.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("allows a request through when IAP is valid and the email is authorized", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
    });

    const { env, proxy } = await importProxyWithEnv();
    env.IAP_AUDIENCE = "projects/123/apps/456";
    env.DEV_AUTH_EMAIL = undefined;

    verifierModuleMock.verifyGoogleIapJwtAssertion.mockResolvedValue({
      email: "operator@zazmic.com",
      sub: "iap-sub-123",
      name: null,
      picture: null,
      nonce: null,
      payload: {},
    });

    const request = new NextRequest("https://mih.local/queue", {
      headers: {
        "x-goog-iap-jwt-assertion": "signed-jwt",
      },
    });

    const response = await proxy(request);

    expect(verifierModuleMock.verifyGoogleIapJwtAssertion).toHaveBeenCalledWith(
      "signed-jwt",
      "projects/123/apps/456",
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();

    restore();
  });

  it("rejects a request without an IAP assertion when IAP is required", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
    });

    const { env, proxy } = await importProxyWithEnv();
    env.IAP_AUDIENCE = "projects/123/apps/456";
    env.DEV_AUTH_EMAIL = undefined;

    const request = new NextRequest("https://mih.local/queue");
    const response = await proxy(request);

    expect(response.status).toBe(307);
    expect(response.headers.get("location")).toContain("/login");
    expect(verifierModuleMock.verifyGoogleIapJwtAssertion).not.toHaveBeenCalled();

    restore();
  });

  it("keeps the development fallback when IAP is not configured", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "development",
      NEXTAUTH_SECRET: "x".repeat(32),
      DEV_AUTH_EMAIL: "dev-operator@zazmic.com",
    });

    const { env, proxy } = await importProxyWithEnv();
    env.IAP_AUDIENCE = undefined;

    const request = new NextRequest("https://mih.local/queue");
    const response = await proxy(request);

    expect(response.status).toBe(200);
    expect(response.headers.get("location")).toBeNull();

    restore();
  });
});
