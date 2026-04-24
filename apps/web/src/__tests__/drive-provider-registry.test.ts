import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const providerMocks = {
  realDriveProvider: { name: "real-drive-provider" },
  mockDriveProvider: { name: "mock-drive-provider" },
};

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

async function importRegistry() {
  vi.resetModules();
  return import("@/modules/content-intake/infrastructure/drive-provider-registry");
}

describe("drive provider registry", () => {
  let restoreEnv: (() => void) | null = null;

  afterEach(() => {
    restoreEnv?.();
    restoreEnv = null;
    vi.resetModules();
  });

  it("returns the mock provider when DRIVE_PROVIDER_MODE is MOCK", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "MOCK",
    });

    vi.doMock("@/modules/content-intake/infrastructure/mock-drive-provider", () => ({
      mockDriveProvider: providerMocks.mockDriveProvider,
    }));
    vi.doMock("@/modules/content-intake/infrastructure/real-drive-provider", () => ({
      realDriveProvider: providerMocks.realDriveProvider,
    }));

    const { getDriveProvider } = await importRegistry();
    expect(getDriveProvider()).toBe(providerMocks.mockDriveProvider);
  });

  it("returns the real provider when DRIVE_PROVIDER_MODE is REAL", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "REAL",
      GOOGLE_CLIENT_ID: "google-client-id",
      GOOGLE_CLIENT_SECRET: "google-client-secret",
    });

    vi.doMock("@/modules/content-intake/infrastructure/mock-drive-provider", () => ({
      mockDriveProvider: providerMocks.mockDriveProvider,
    }));
    vi.doMock("@/modules/content-intake/infrastructure/real-drive-provider", () => ({
      realDriveProvider: providerMocks.realDriveProvider,
    }));

    const { getDriveProvider } = await importRegistry();
    expect(getDriveProvider()).toBe(providerMocks.realDriveProvider);
  });

  it("throws during boot when DRIVE_PROVIDER_MODE is REAL without Google credentials", async () => {
    restoreEnv = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "x".repeat(32),
      DRIVE_PROVIDER_MODE: "REAL",
      GOOGLE_CLIENT_ID: undefined,
      GOOGLE_CLIENT_SECRET: undefined,
    });

    await expect(importRegistry()).rejects.toThrow(
      "DRIVE_PROVIDER_MODE=REAL requires GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET.",
    );
  });
});
