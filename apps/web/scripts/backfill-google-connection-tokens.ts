import "dotenv/config";

import { getPrisma } from "@/shared/lib/prisma";
import { encryptSensitive } from "@/shared/lib/encryption";

async function main() {
  const prisma = getPrisma();
  const connections = await prisma.googleConnection.findMany({
    select: {
      id: true,
      accessToken: true,
      accessTokenEncrypted: true,
      refreshToken: true,
      refreshTokenEncrypted: true,
    },
  });

  let updated = 0;

  for (const connection of connections) {
    const nextAccessTokenEncrypted =
      connection.accessTokenEncrypted ??
      (connection.accessToken.trim().length > 0
        ? encryptSensitive(connection.accessToken.trim())
        : null);
    const nextRefreshTokenEncrypted =
      connection.refreshTokenEncrypted ??
      (typeof connection.refreshToken === "string" && connection.refreshToken.trim().length > 0
        ? encryptSensitive(connection.refreshToken.trim())
        : null);

    const needsUpdate =
      nextAccessTokenEncrypted !== connection.accessTokenEncrypted ||
      nextRefreshTokenEncrypted !== connection.refreshTokenEncrypted ||
      connection.accessToken !== "" ||
      connection.refreshToken !== null;

    if (!needsUpdate) {
      continue;
    }

    await prisma.googleConnection.update({
      where: { id: connection.id },
      data: {
        accessToken: "",
        accessTokenEncrypted: nextAccessTokenEncrypted,
        refreshToken: null,
        refreshTokenEncrypted: nextRefreshTokenEncrypted,
        encryptionVersion: 1,
      },
    });

    updated += 1;
  }

  console.info(`[backfill-google-connection-tokens] updated ${updated} rows`);
}

main()
  .then(async () => {
    const prisma = getPrisma();
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error("[backfill-google-connection-tokens] failed", error);
    const prisma = getPrisma();
    await prisma.$disconnect();
    process.exit(1);
  });
