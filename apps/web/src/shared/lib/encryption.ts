import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";
import { env } from "@/shared/config/env";

const ENCRYPTION_VERSION = "v1";

function deriveEncryptionKey() {
  const source = env.ENCRYPTION_KEY?.trim() || env.NEXTAUTH_SECRET;
  return createHash("sha256").update(source).digest();
}

function encode(value: Buffer) {
  return value.toString("base64url");
}

function decode(value: string) {
  return Buffer.from(value, "base64url");
}

export function encryptSensitive(value: string): string {
  const plaintext = value.trim();
  if (!plaintext) {
    throw new Error("Sensitive values must not be empty.");
  }

  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", deriveEncryptionKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return [
    ENCRYPTION_VERSION,
    encode(iv),
    encode(authTag),
    encode(encrypted),
  ].join(".");
}

export function decryptSensitive(value: string): string {
  const [version, ivRaw, tagRaw, payloadRaw] = value.split(".");

  if (version !== ENCRYPTION_VERSION || !ivRaw || !tagRaw || !payloadRaw) {
    throw new Error("Encrypted value is not in the expected format.");
  }

  const decipher = createDecipheriv("aes-256-gcm", deriveEncryptionKey(), decode(ivRaw));
  decipher.setAuthTag(decode(tagRaw));
  const decrypted = Buffer.concat([
    decipher.update(decode(payloadRaw)),
    decipher.final(),
  ]);

  return decrypted.toString("utf8");
}
