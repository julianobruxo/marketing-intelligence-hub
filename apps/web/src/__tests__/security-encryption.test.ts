import { describe, expect, it, vi } from "vitest";

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

async function importFreshEncryption() {
  vi.resetModules();
  return import("@/shared/lib/encryption");
}

describe("sensitive value encryption", () => {
  it("round-trips encrypted values and trims accidental whitespace", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "encryption-key-one",
    });

    const { encryptSensitive, decryptSensitive } = await importFreshEncryption();
    const ciphertext = encryptSensitive("  refresh-token-123  ");

    expect(ciphertext).not.toContain("refresh-token-123");
    expect(decryptSensitive(ciphertext)).toBe("refresh-token-123");

    restore();
  });

  it("throws when decrypting with the wrong key", async () => {
    const firstRestore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "encryption-key-one",
    });

    const firstModule = await importFreshEncryption();
    const ciphertext = firstModule.encryptSensitive("access-token-456");
    firstRestore();

    const secondRestore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "encryption-key-two",
    });

    const secondModule = await importFreshEncryption();

    expect(() => secondModule.decryptSensitive(ciphertext)).toThrow();

    secondRestore();
  });

  it("rejects malformed encrypted payloads", async () => {
    const restore = setProcessEnv({
      NODE_ENV: "test",
      NEXTAUTH_SECRET: "a".repeat(32),
      ENCRYPTION_KEY: "encryption-key-three",
    });

    const { decryptSensitive } = await importFreshEncryption();

    expect(() => decryptSensitive("not-a-valid-payload")).toThrow(
      "Encrypted value is not in the expected format.",
    );

    restore();
  });
});
