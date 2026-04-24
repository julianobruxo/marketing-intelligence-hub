import "dotenv/config";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  AppRole,
  ApprovalDecision,
  ApprovalStage,
  AssetStatus,
  AssetType,
  ContentProfile,
  ContentStatus,
  ContentType,
  DesignProvider,
  DesignRequestStatus,
  ImportMode,
  ImportReceiptStatus,
  NoteType,
  OrchestratorType,
  PrismaClient,
  TranslationStatus,
  UpstreamSystem,
} from "@prisma/client";
import pg from "pg";

const connectionString = process.env.DIRECT_DATABASE_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("DIRECT_DATABASE_URL or DATABASE_URL must be set for seeding.");
}

process.env.DATABASE_URL = connectionString;

const pool = new pg.Pool({ connectionString });
const adapter = new PrismaPg(pool);
const prisma = new PrismaClient({ adapter });

async function upsertUserWithRoles(email, name, roles) {
  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      isActive: true,
    },
    create: {
      email,
      name,
      roles: {
        create: roles.map((role) => ({ role })),
      },
    },
    include: {
      roles: true,
    },
  });

  const existingRoles = new Set(user.roles.map(({ role }) => role));
  const missingRoles = roles.filter((role) => !existingRoles.has(role));

  if (missingRoles.length > 0) {
    await prisma.userRole.createMany({
      data: missingRoles.map((role) => ({
        userId: user.id,
        role,
      })),
      skipDuplicates: true,
    });
  }

  return user;
}

async function ensureGoogleConnectionForUser(user, { googleEmail = user.email, refreshToken = null } = {}) {
  await prisma.googleConnection.upsert({
    where: { userId: user.id },
    create: {
      userId: user.id,
      googleSub: `sub-${user.id}`,
      googleEmail,
      accessToken: "dev-mock-token",
      refreshToken,
      scope:
        "openid email profile https://www.googleapis.com/auth/drive.readonly https://www.googleapis.com/auth/spreadsheets.readonly",
      active: true,
    },
    update: {
      googleEmail,
      active: true,
    },
  });
}

async function ensureImportReceipt({
  idempotencyKey,
  mode = ImportMode.COMMIT,
  payloadVersion = 1,
  fingerprint,
  payload,
  contentItemId,
  importedById,
  sheetProfileKey = "zazmic-brazil-monthly-linkedin",
  status = ImportReceiptStatus.PROCESSED,
  errorCode = null,
  errorMessage = null,
  receivedAt = new Date(),
  processedAt = new Date(),
}) {
  const existing = await prisma.importReceipt.findUnique({
    where: {
      idempotencyKey_mode: {
        idempotencyKey,
        mode,
      },
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.importReceipt.create({
    data: {
      idempotencyKey,
      mode,
      orchestrator: OrchestratorType.N8N,
      upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
      sheetProfileKey,
      sheetProfileVersion: 1,
      status,
      payloadVersion,
      fingerprint,
      payload,
      contentItemId,
      importedById,
      errorCode,
      errorMessage,
      receivedAt,
      processedAt: status === ImportReceiptStatus.RECEIVED ? null : processedAt,
    },
  });
}

async function ensureSourceLink({
  contentItemId,
  spreadsheetId,
  worksheetId,
  worksheetName,
  rowId,
  rowNumber,
  rowVersion,
  lastFingerprint,
}) {
  const existing = await prisma.contentSourceLink.findFirst({
    where: {
      spreadsheetId,
      worksheetId,
      rowId,
    },
  });

  if (existing) {
    return prisma.contentSourceLink.update({
      where: { id: existing.id },
      data: {
        contentItemId,
        worksheetName,
        rowNumber,
        rowVersion,
        lastFingerprint,
        sheetProfileKey: "zazmic-brazil-monthly-linkedin",
        sheetProfileVersion: 1,
      },
    });
  }

  return prisma.contentSourceLink.create({
    data: {
      contentItemId,
      upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
      sheetProfileKey: "zazmic-brazil-monthly-linkedin",
      sheetProfileVersion: 1,
      spreadsheetId,
      worksheetId,
      worksheetName,
      rowId,
      rowNumber,
      rowVersion,
      lastFingerprint,
    },
  });
}

async function ensureStatusEvent(
  contentItemId,
  toStatus,
  note,
  fromStatus = null,
  actorEmail = null,
  createdAt = null,
) {
  const existing = await prisma.statusEvent.findFirst({
    where: {
      contentItemId,
      toStatus,
      note,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.statusEvent.create({
    data: {
      contentItemId,
      fromStatus,
      toStatus,
      actorEmail,
      note,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function ensureWorkflowNote(contentItemId, authorId, type, body, createdAt = null) {
  const existing = await prisma.workflowNote.findFirst({
    where: {
      contentItemId,
      authorId,
      type,
      body,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.workflowNote.create({
    data: {
      contentItemId,
      authorId,
      type,
      body,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function ensureApproval(contentItemId, actorId, stage, decision, note, createdAt = null) {
  const existing = await prisma.approvalRecord.findFirst({
    where: {
      contentItemId,
      actorId,
      stage,
      decision,
      note,
    },
  });

  if (existing) {
    return existing;
  }

  return prisma.approvalRecord.create({
    data: {
      contentItemId,
      actorId,
      stage,
      decision,
      note,
      ...(createdAt ? { createdAt } : {}),
    },
  });
}

async function ensureDesignRequest({
  contentItemId,
  profileMappingId,
  attemptNumber,
  status,
  externalRequestId,
  errorCode = null,
  errorMessage = null,
  requestFingerprint,
  requestPayload,
  resultPayload,
  createdAt = null,
  updatedAt = null,
}) {
  const existing = await prisma.designRequest.findFirst({
    where: {
      contentItemId,
      requestFingerprint,
      attemptNumber,
    },
  });

  if (existing) {
    return prisma.designRequest.update({
      where: { id: existing.id },
      data: {
        profileMappingId,
        status,
        externalRequestId,
        errorCode,
        errorMessage,
        requestPayload,
        resultPayload,
        ...(updatedAt ? { updatedAt } : {}),
      },
    });
  }

  return prisma.designRequest.create({
    data: {
      contentItemId,
      profileMappingId,
      designProvider: DesignProvider.CANVA,
      requestFingerprint,
      attemptNumber,
      status,
      externalRequestId,
      errorCode,
      errorMessage,
      requestPayload,
      resultPayload,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    },
  });
}

async function ensureAsset({
  id,
  contentItemId,
  designRequestId,
  assetType = AssetType.STATIC_IMAGE,
  assetStatus,
  locale = "en",
  externalUrl,
  metadata,
  createdAt = null,
  updatedAt = null,
}) {
  const existing = await prisma.contentAsset.findUnique({
    where: { id },
  });

  if (existing) {
    return prisma.contentAsset.update({
      where: { id },
      data: {
        designRequestId,
        assetType,
        assetStatus,
        locale,
        externalUrl,
        metadata,
        ...(updatedAt ? { updatedAt } : {}),
      },
    });
  }

  return prisma.contentAsset.create({
    data: {
      id,
      contentItemId,
      designRequestId,
      assetType,
      assetStatus,
      locale,
      externalUrl,
      metadata,
      ...(createdAt ? { createdAt } : {}),
      ...(updatedAt ? { updatedAt } : {}),
    },
  });
}

async function upsertContentItem(input) {
  return prisma.contentItem.upsert({
    where: { canonicalKey: input.canonicalKey },
    update: {
      profile: input.profile,
      contentType: input.contentType,
      title: input.title,
      copy: input.copy,
      sourceLocale: input.sourceLocale ?? "en",
      translationRequired: input.translationRequired ?? false,
      translationStatus: input.translationStatus ?? TranslationStatus.NOT_REQUIRED,
      currentStatus: input.currentStatus,
      latestImportAt: input.latestImportAt,
      planningSnapshot: input.planningSnapshot,
    },
    create: {
      canonicalKey: input.canonicalKey,
      profile: input.profile,
      contentType: input.contentType,
      title: input.title,
      copy: input.copy,
      sourceLocale: input.sourceLocale ?? "en",
      translationRequired: input.translationRequired ?? false,
      translationStatus: input.translationStatus ?? TranslationStatus.NOT_REQUIRED,
      currentStatus: input.currentStatus,
      latestImportAt: input.latestImportAt,
      planningSnapshot: input.planningSnapshot,
    },
  });
}

async function main() {
  const alinaEmail = process.env.SEED_ALINA_EMAIL ?? "alina@zazmic.com";
  const julianoEmail = process.env.SEED_JULIANO_EMAIL ?? "juliano.silva@zazmic.com";
  const julianoLegacyEmail = process.env.SEED_JULIANO_LEGACY_EMAIL ?? "juliano@zazmic.com";
  const julianoRoles = [
    AppRole.ADMIN,
    AppRole.EDITOR,
    AppRole.TRANSLATION_APPROVER,
  ];

  const alina = await upsertUserWithRoles(alinaEmail, "Alina", [AppRole.ADMIN, AppRole.APPROVER]);
  const juliano = await upsertUserWithRoles(julianoEmail, "Juliano", julianoRoles);
  const julianoLegacy =
    julianoLegacyEmail.toLowerCase() === julianoEmail.toLowerCase()
      ? juliano
      : await upsertUserWithRoles(julianoLegacyEmail, "Juliano", julianoRoles);

  // Ensure Google connections for dev users so Scan Drive doesn't fail with NO_GOOGLE_CONNECTION
  // In a real environment, these tokens would be obtained via the OAuth flow.
  // For local dev, we seed them so the connection record exists.
  await ensureGoogleConnectionForUser(alina, {
    refreshToken: process.env.ALINA_GOOGLE_REFRESH_TOKEN || null,
  });

  await ensureGoogleConnectionForUser(juliano, {
    refreshToken: process.env.JULIANO_GOOGLE_REFRESH_TOKEN || null,
  });

  if (julianoLegacy.id !== juliano.id) {
    await ensureGoogleConnectionForUser(julianoLegacy, {
      googleEmail: juliano.email,
      refreshToken:
        process.env.JULIANO_LEGACY_GOOGLE_REFRESH_TOKEN ||
        process.env.JULIANO_GOOGLE_REFRESH_TOKEN ||
        null,
    });
  }

  await prisma.contentItem.deleteMany({
    where: {
      OR: [
        { canonicalKey: { startsWith: "yann-" } },
        { canonicalKey: { startsWith: "yuri-" } },
        { canonicalKey: "zazmic-brazil-2026-04-08-browser-gap" },
        { canonicalKey: "SHAWN-static-canva-slice-1" },
        { canonicalKey: "SHAWN-design-progress" },
        { canonicalKey: "SHAWN-design-failed" },
        { canonicalKey: "SOPHIAN_YACINE-revision-blocked" },
        { canonicalKey: "SHAWN-design-ready" },
        { canonicalKey: "SHAWN-imported-intake" },
        { canonicalKey: "zazmic-jobs-route-missing" },
        { canonicalKey: "SHAWN-translation-pending" },
        { canonicalKey: "SOPHIAN_YACINE-ready-to-publish" },
        { canonicalKey: "SHAWN-manual-published" },
        { canonicalKey: "yann-demo-static-post" },
        { canonicalKey: "yuri-demo-static-post" },
      ],
    },
  });

  await prisma.profileTemplateMapping.deleteMany({
    where: {
      OR: [
        { externalTemplateId: { startsWith: "seed-YANN-" } },
        { externalTemplateId: { startsWith: "seed-YURI-" } },
        { displayName: { contains: "Yann", mode: "insensitive" } },
        { displayName: { contains: "Yuri", mode: "insensitive" } },
      ],
    },
  });

  const templateMappings = [
    {
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      externalTemplateId: "seed-SHAWN-static-en",
      displayName: "Shawn Static English",
    },
    {
      profile: ContentProfile.SOPHIAN_YACINE,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      externalTemplateId: "seed-SOPHIAN_YACINE-static-en",
      displayName: "Sophian Yacine Static English",
    },
    {
      profile: ContentProfile.YANN,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      externalTemplateId: "seed-YANN-static-en",
      displayName: "Yann Static English",
    },
    {
      profile: ContentProfile.YURI,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      externalTemplateId: "seed-YURI-static-en",
      displayName: "Yuri Static English",
    },
    {
      profile: ContentProfile.ZAZMIC_PAGE,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      externalTemplateId: "seed-ZAZMIC_PAGE-static-en",
      displayName: "Zazmic Page Static English",
    },
  ];

  for (const mapping of templateMappings) {
    const existingMapping = await prisma.profileTemplateMapping.findFirst({
      where: {
        profile: mapping.profile,
        contentType: mapping.contentType,
        locale: mapping.locale,
        designProvider: mapping.designProvider,
        externalTemplateId: mapping.externalTemplateId,
      },
    });

    if (existingMapping) {
      await prisma.profileTemplateMapping.update({
        where: { id: existingMapping.id },
        data: {
          displayName: mapping.displayName,
          isActive: true,
        },
      });
    } else {
      await prisma.profileTemplateMapping.create({
        data: mapping,
      });
    }

    await prisma.profileTemplateMapping.updateMany({
      where: {
        profile: mapping.profile,
        contentType: mapping.contentType,
        locale: mapping.locale,
        designProvider: mapping.designProvider,
      },
      data: {
        displayName: mapping.displayName,
        isActive: true,
      },
    });
  }

  if (process.env.SEED_DEMO_CONTENT === "true") {
  const shawnTemplate = await prisma.profileTemplateMapping.findFirst({
    where: {
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      isActive: true,
    },
  });

  const sophianYacineTemplate = await prisma.profileTemplateMapping.findFirst({
    where: {
      profile: ContentProfile.SOPHIAN_YACINE,
      contentType: ContentType.STATIC_POST,
      locale: "en",
      designProvider: DesignProvider.CANVA,
      isActive: true,
    },
  });

  const sampleItems = [
    {
      canonicalKey: "zazmic-brazil-2026-04-08-browser-gap",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "PROMO | CHROME ENTERPRISE",
      copy:
        "Your team spends 71% of their work time in a browser. But is it protected? Most companies are shocked to discover their biggest security gap is the browser.",
      currentStatus: ContentStatus.IN_REVIEW,
      translationRequired: true,
      translationStatus: TranslationStatus.REQUESTED,
      latestImportAt: new Date("2026-04-08T12:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-08",
          platformLabel: "LinkedIn",
          campaignLabel: "PROMO | CHROME ENTERPRISE",
          copyEnglish:
            "Your team spends 71% of their work time in a browser. But is it protected? Most companies are shocked to discover their biggest security gap is the browser.",
          copyPortuguese:
            "Seu time passa 71% do tempo de trabalho em um navegador. Mas ele esta protegido?",
          sourceAssetLink: "https://drive.google.com/drive/folders/example-browser-gap",
          contentDeadline: "2026-04-06",
        },
        sourceMetadata: {
          publishedFlag: "Yes",
          publishedPostUrl: "",
          outreachAccount: "",
          outreachCopy: "",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "PROMO | CHROME ENTERPRISE",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-17",
        rowNumber: 17,
        rowVersion: "2026-04-08T12:00:00.000Z",
        lastFingerprint: "seed-browser-gap",
      },
    },
    {
      canonicalKey: "SHAWN-static-canva-slice-1",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Browser activity is your biggest hidden security risk",
      copy:
        "Browser activity is where many teams unknowingly expose company data, extensions, and workflows every single day. The browser is not just where work happens. It is where enterprise risk compounds.",
      currentStatus: ContentStatus.CONTENT_APPROVED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-15T12:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-15",
          platformLabel: "LinkedIn",
          campaignLabel: "Browser risk awareness",
          copyEnglish:
            "Browser activity is where many teams unknowingly expose company data, extensions, and workflows every single day. The browser is not just where work happens. It is where enterprise risk compounds.",
          sourceAssetLink: "",
          contentDeadline: "2026-04-14",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Browser activity is your biggest hidden security risk",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-43",
        rowNumber: 43,
        rowVersion: "2026-04-15T12:00:00.000Z",
        lastFingerprint: "seed-canva-slice-1",
      },
    },
    {
      canonicalKey: "SHAWN-design-progress",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "The browser is now part of your enterprise attack surface",
      copy:
        "Work is flowing through the browser all day long. That makes the browser one of the clearest places to understand and reduce risk before it spreads.",
      currentStatus: ContentStatus.DESIGN_IN_PROGRESS,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-14T15:30:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-16",
          platformLabel: "LinkedIn",
          campaignLabel: "Attack surface awareness",
          copyEnglish:
            "Work is flowing through the browser all day long. That makes the browser one of the clearest places to understand and reduce risk before it spreads.",
          contentDeadline: "2026-04-15",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "PROFILE_FALLBACK_FIELD",
            sourceField: "copyEnglish",
            title: "The browser is now part of your enterprise attack surface",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-51",
        rowNumber: 51,
        rowVersion: "2026-04-14T15:30:00.000Z",
        lastFingerprint: "seed-design-progress",
      },
    },
    {
      canonicalKey: "SHAWN-design-failed",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Why browser risk is operational, not theoretical",
      copy:
        "Browser-based work creates a constant stream of extensions, downloads, and shadow workflows. That is why browser risk should be treated as an operational system problem.",
      currentStatus: ContentStatus.DESIGN_FAILED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-13T11:15:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-17",
          platformLabel: "LinkedIn",
          campaignLabel: "Operational browser risk",
          copyEnglish:
            "Browser-based work creates a constant stream of extensions, downloads, and shadow workflows. That is why browser risk should be treated as an operational system problem.",
          contentDeadline: "2026-04-16",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Why browser risk is operational, not theoretical",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-58",
        rowNumber: 58,
        rowVersion: "2026-04-13T11:15:00.000Z",
        lastFingerprint: "seed-design-failed",
      },
    },
    {
      canonicalKey: "SOPHIAN_YACINE-revision-blocked",
      profile: ContentProfile.SOPHIAN_YACINE,
      contentType: ContentType.STATIC_POST,
      title: "A cleaner message for the first SOPHIAN_YACINE workflow pass",
      copy:
        "This item is intentionally parked in changes requested so the queue shows a blocked lane for editorial follow-up.",
      currentStatus: ContentStatus.CHANGES_REQUESTED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-12T10:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-18",
          platformLabel: "LinkedIn",
          campaignLabel: "SOPHIAN_YACINE message test",
          copyEnglish:
            "This item is intentionally parked in changes requested so the queue shows a blocked lane for editorial follow-up.",
          contentDeadline: "2026-04-17",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "A cleaner message for the first SOPHIAN_YACINE workflow pass",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-62",
        rowNumber: 62,
        rowVersion: "2026-04-12T10:00:00.000Z",
        lastFingerprint: "seed-SOPHIAN_YACINE-blocked",
      },
    },
    {
      canonicalKey: "SHAWN-design-ready",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Generated design ready for human approval",
      copy:
        "This item is seeded as design ready so the queue can clearly show a handoff waiting on operator approval.",
      currentStatus: ContentStatus.DESIGN_READY,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-11T09:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-19",
          platformLabel: "LinkedIn",
          campaignLabel: "Design ready seed",
          copyEnglish:
            "This item is seeded as design ready so the queue can clearly show a handoff waiting on operator approval.",
          contentDeadline: "2026-04-18",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Generated design ready for human approval",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-66",
        rowNumber: 66,
        rowVersion: "2026-04-11T09:00:00.000Z",
        lastFingerprint: "seed-SHAWN-ready",
      },
    },
    {
      canonicalKey: "SHAWN-imported-intake",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Imported planning row waiting for first review",
      copy:
        "This seeded item stays at the imported checkpoint so the queue always has one row showing untouched intake work from Sheets.",
      currentStatus: ContentStatus.IMPORTED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-10T14:30:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-21",
          platformLabel: "LinkedIn",
          campaignLabel: "Imported intake seed",
          copyEnglish:
            "This seeded item stays at the imported checkpoint so the queue always has one row showing untouched intake work from Sheets.",
          contentDeadline: "2026-04-20",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Imported planning row waiting for first review",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-71",
        rowNumber: 71,
        rowVersion: "2026-04-10T14:30:00.000Z",
        lastFingerprint: "seed-imported-intake",
      },
    },
    {
      canonicalKey: "zazmic-jobs-route-missing",
      profile: ContentProfile.ZAZMIC_PAGE,
      contentType: ContentType.STATIC_POST,
      title: "Job-post route approved but still missing a mapped template",
      copy:
        "This item is intentionally approved without an active template route so the queue can show a real routing blocker instead of only provider failures.",
      currentStatus: ContentStatus.CONTENT_APPROVED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-09T13:20:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-22",
          platformLabel: "LinkedIn",
          campaignLabel: "Zazmic jobs route gap",
          copyEnglish:
            "This item is intentionally approved without an active template route so the queue can show a real routing blocker instead of only provider failures.",
          contentDeadline: "2026-04-21",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Job-post route approved but still missing a mapped template",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-74",
        rowNumber: 74,
        rowVersion: "2026-04-09T13:20:00.000Z",
        lastFingerprint: "seed-jobs-route-missing",
      },
    },
    {
      canonicalKey: "SHAWN-translation-pending",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Localized version is waiting on translation approval",
      copy:
        "This seeded item is already through design approval and is now paused at the translation checkpoint to keep the blocked lane and detail approvals realistic.",
      currentStatus: ContentStatus.TRANSLATION_PENDING,
      translationRequired: true,
      translationStatus: TranslationStatus.READY_FOR_APPROVAL,
      latestImportAt: new Date("2026-04-08T16:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-23",
          platformLabel: "LinkedIn",
          campaignLabel: "Translation pending seed",
          copyEnglish:
            "This seeded item is already through design approval and is now paused at the translation checkpoint to keep the blocked lane and detail approvals realistic.",
          copyPortuguese:
            "Este item ja passou pela aprovacao do design e agora espera a aprovacao da traducao.",
          contentDeadline: "2026-04-22",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Localized version is waiting on translation approval",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-77",
        rowNumber: 77,
        rowVersion: "2026-04-08T16:00:00.000Z",
        lastFingerprint: "seed-translation-pending",
      },
    },
    {
      canonicalKey: "SOPHIAN_YACINE-ready-to-publish",
      profile: ContentProfile.SOPHIAN_YACINE,
      contentType: ContentType.STATIC_POST,
      title: "Design and approvals are cleared for publishing prep",
      copy:
        "This item is positioned at ready to publish so the queue and detail view both show what a downstream-ready content package looks like.",
      currentStatus: ContentStatus.READY_TO_PUBLISH,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-07T17:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-24",
          platformLabel: "LinkedIn",
          campaignLabel: "Ready to publish seed",
          copyEnglish:
            "This item is positioned at ready to publish so the queue and detail view both show what a downstream-ready content package looks like.",
          contentDeadline: "2026-04-23",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Design and approvals are cleared for publishing prep",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-82",
        rowNumber: 82,
        rowVersion: "2026-04-07T17:00:00.000Z",
        lastFingerprint: "seed-ready-to-publish",
      },
    },
    {
      canonicalKey: "SHAWN-manual-published",
      profile: ContentProfile.SHAWN,
      contentType: ContentType.STATIC_POST,
      title: "Manual LinkedIn fallback already completed",
      copy:
        "This seeded item keeps the manual publishing fallback visible so the ready surface shows one completed outcome, not only in-flight work.",
      currentStatus: ContentStatus.PUBLISHED_MANUALLY,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-06T15:00:00.000Z"),
      planningSnapshot: {
        version: 2,
        planning: {
          plannedDate: "2026-04-20",
          platformLabel: "LinkedIn",
          campaignLabel: "Published fallback seed",
          copyEnglish:
            "This seeded item keeps the manual publishing fallback visible so the ready surface shows one completed outcome, not only in-flight work.",
          contentDeadline: "2026-04-19",
        },
        sourceMetadata: {
          publishedFlag: "Yes",
          publishedPostUrl: "https://www.linkedin.com/feed/update/seed-published-fallback",
        },
        normalization: {
          sheetProfileKey: "zazmic-brazil-monthly-linkedin",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Manual LinkedIn fallback already completed",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "zazmic-brazil-smm-plan",
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rowId: "row-89",
        rowNumber: 89,
        rowVersion: "2026-04-06T15:00:00.000Z",
        lastFingerprint: "seed-manual-published",
      },
    },
    {
      canonicalKey: "yann-demo-static-post",
      profile: ContentProfile.YANN,
      contentType: ContentType.STATIC_POST,
      title: "Yann's initial demo content item",
      copy: "Sourced automatically during seed constraints ensuring Yann representation across layout constraints.",
      currentStatus: ContentStatus.IMPORTED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-10T15:00:00.000Z"),
      planningSnapshot: {
        version: 1,
        planning: {
          plannedDate: "2026-04-30",
          platformLabel: "LinkedIn",
          campaignLabel: "Yann Demo",
          copyEnglish: "Sourced automatically during seed constraints ensuring Yann representation across layout constraints.",
          contentDeadline: "2026-04-29",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "yann-demo-profile",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Yann's initial demo content item",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "1jjYpO7XxCBY2Jfe7hnqanS2H2EJDbbzs-P_BmkefLM4",
        worksheetId: "Demo",
        worksheetName: "Demo Tab",
        rowId: "row-1",
        rowNumber: 1,
        rowVersion: "2026-04-10T15:00:00.000Z",
        lastFingerprint: "seed-yann-demo",
      },
    },
    {
      canonicalKey: "yuri-demo-static-post",
      profile: ContentProfile.YURI,
      contentType: ContentType.STATIC_POST,
      title: "Yuri's initial demo content item",
      copy: "Included via automated DB seeding scripts mimicking base operational boundaries.",
      currentStatus: ContentStatus.IMPORTED,
      translationRequired: false,
      translationStatus: TranslationStatus.NOT_REQUIRED,
      latestImportAt: new Date("2026-04-11T10:00:00.000Z"),
      planningSnapshot: {
        version: 1,
        planning: {
          plannedDate: "2026-05-15",
          platformLabel: "LinkedIn",
          campaignLabel: "Yuri Demo",
          copyEnglish: "Included via automated DB seeding scripts mimicking base operational boundaries.",
          contentDeadline: "2026-05-10",
        },
        sourceMetadata: {
          publishedFlag: "No",
        },
        normalization: {
          sheetProfileKey: "yuri-demo-profile",
          titleDerivation: {
            strategy: "EXPLICIT_MAPPED_FIELD",
            sourceField: "campaignLabel",
            title: "Yuri's initial demo content item",
          },
        },
      },
      sourceLink: {
        spreadsheetId: "demo-yuri-spreadsheet",
        worksheetId: "Demo",
        worksheetName: "Demo Tab",
        rowId: "row-1",
        rowNumber: 1,
        rowVersion: "2026-04-11T10:00:00.000Z",
        lastFingerprint: "seed-yuri-demo",
      },
    },
  ];

  const itemsByKey = {};

  for (const sample of sampleItems) {
    const item = await upsertContentItem(sample);
    itemsByKey[sample.canonicalKey] = item;

    await ensureSourceLink({
      contentItemId: item.id,
      ...sample.sourceLink,
    });

    await ensureImportReceipt({
      idempotencyKey: `${sample.canonicalKey}-commit-v1`,
      fingerprint: `${sample.canonicalKey}-fingerprint-v1`,
      payloadVersion: 1,
      payload: sample.planningSnapshot,
      contentItemId: item.id,
      importedById: juliano.id,
      receivedAt: sample.latestImportAt ?? new Date(),
      processedAt: sample.latestImportAt ?? new Date(),
    });
  }

  const browserGap = itemsByKey["zazmic-brazil-2026-04-08-browser-gap"];
  await ensureImportReceipt({
    idempotencyKey: "zazmic-brazil-2026-04-08-browser-gap-preview-v1",
    mode: ImportMode.PREVIEW,
    fingerprint: "browser-gap-preview-fingerprint-v1",
    payloadVersion: 1,
    payload: browserGap.planningSnapshot,
    contentItemId: browserGap.id,
    importedById: juliano.id,
    receivedAt: new Date("2026-04-08T11:30:00.000Z"),
    processedAt: new Date("2026-04-08T11:31:00.000Z"),
  });
  await ensureImportReceipt({
    idempotencyKey: "zazmic-brazil-2026-04-08-browser-gap-commit-v2",
    mode: ImportMode.COMMIT,
    fingerprint: "browser-gap-commit-fingerprint-v2",
    payloadVersion: 2,
    payload: browserGap.planningSnapshot,
    contentItemId: browserGap.id,
    importedById: juliano.id,
    receivedAt: new Date("2026-04-08T12:20:00.000Z"),
    processedAt: new Date("2026-04-08T12:21:00.000Z"),
  });
  await ensureStatusEvent(
    browserGap.id,
    ContentStatus.IMPORTED,
    "Seeded sample item imported from normalized planning payload.",
    null,
    juliano.email,
    new Date("2026-04-08T12:21:00.000Z"),
  );
  await ensureStatusEvent(
    browserGap.id,
    ContentStatus.IN_REVIEW,
    "Editorial review started after import because the first hook needed tightening.",
    ContentStatus.IMPORTED,
    juliano.email,
    new Date("2026-04-08T13:10:00.000Z"),
  );
  await ensureWorkflowNote(
    browserGap.id,
    juliano.id,
    NoteType.COMMENT,
    "Needs final approval copy pass and Portuguese review before design.",
    new Date("2026-04-08T13:20:00.000Z"),
  );
  await ensureWorkflowNote(
    browserGap.id,
    alina.id,
    NoteType.REVISION,
    "Keep the opening line tighter and make the browser risk punchier.",
    new Date("2026-04-08T14:00:00.000Z"),
  );
  await ensureApproval(
    browserGap.id,
    juliano.id,
    ApprovalStage.TRANSLATION,
    ApprovalDecision.CHANGES_REQUESTED,
    "Adjust the Portuguese copy for tone before approval.",
    new Date("2026-04-08T15:00:00.000Z"),
  );

  const ShawnApproved = itemsByKey["SHAWN-static-canva-slice-1"];
  await ensureStatusEvent(
    ShawnApproved.id,
    ContentStatus.IMPORTED,
    "Imported planning row committed into the canonical content item.",
    null,
    juliano.email,
    new Date("2026-04-15T12:00:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnApproved.id,
    ContentStatus.IN_REVIEW,
    "Editorial review completed without revision requests.",
    ContentStatus.IMPORTED,
    juliano.email,
    new Date("2026-04-15T12:30:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnApproved.id,
    ContentStatus.CONTENT_APPROVED,
    "Seeded sample item prepared for a first design attempt.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-15T13:00:00.000Z"),
  );
  await ensureApproval(
    ShawnApproved.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.APPROVED,
    "Approved for the first SHAWN design handoff.",
    new Date("2026-04-15T13:00:00.000Z"),
  );

  const ShawnProgress = itemsByKey["SHAWN-design-progress"];
  await ensureStatusEvent(
    ShawnProgress.id,
    ContentStatus.CONTENT_APPROVED,
    "Content cleared for the first design handoff.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-14T15:40:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnProgress.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 1 created for SHAWN Static English.",
    ContentStatus.CONTENT_APPROVED,
    alina.email,
    new Date("2026-04-14T15:50:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnProgress.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted design attempt 1 and is still in progress.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-14T15:55:00.000Z"),
  );
  await ensureWorkflowNote(
    ShawnProgress.id,
    juliano.id,
    NoteType.COMMENT,
    "Keep the value point short. We only need one strong browser-risk angle in the first slide.",
    new Date("2026-04-14T16:05:00.000Z"),
  );
  await ensureDesignRequest({
    contentItemId: ShawnProgress.id,
    profileMappingId: shawnTemplate?.id ?? null,
    attemptNumber: 1,
    status: DesignRequestStatus.IN_PROGRESS,
    externalRequestId: "fake-canva-SHAWN-progress-1",
    requestFingerprint: "seed-SHAWN-progress",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "DELAYED_SUCCESS",
      },
      templateId: "seed-SHAWN-static-en",
      contentItemId: ShawnProgress.id,
      attemptNumber: 1,
    },
    resultPayload: {
      job: {
        id: "fake-canva-SHAWN-progress-1",
        status: "in_progress",
        progress: 0.58,
      },
      meta: {
        simulationScenario: "DELAYED_SUCCESS",
        providerMode: "FAKE_CANVA",
        syncCount: 1,
        remainingPolls: 1,
      },
    },
    createdAt: new Date("2026-04-14T15:50:00.000Z"),
    updatedAt: new Date("2026-04-14T16:10:00.000Z"),
  });

  const ShawnFailed = itemsByKey["SHAWN-design-failed"];
  await ensureStatusEvent(
    ShawnFailed.id,
    ContentStatus.CONTENT_APPROVED,
    "Content cleared for design before a simulated provider failure.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-13T11:25:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnFailed.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 1 created for SHAWN Static English.",
    ContentStatus.CONTENT_APPROVED,
    alina.email,
    new Date("2026-04-13T11:40:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnFailed.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted design attempt 1 before failing on sync.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-13T11:42:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnFailed.id,
    ContentStatus.DESIGN_FAILED,
    "Design attempt failed at provider_sync: The simulated Canva adapter failed while rendering the requested template data.",
    ContentStatus.DESIGN_IN_PROGRESS,
    alina.email,
    new Date("2026-04-13T11:58:00.000Z"),
  );
  await ensureWorkflowNote(
    ShawnFailed.id,
    juliano.id,
    NoteType.REVISION,
    "Retry after checking whether the body text still fits the seeded template family.",
    new Date("2026-04-13T12:05:00.000Z"),
  );
  await ensureDesignRequest({
    contentItemId: ShawnFailed.id,
    profileMappingId: shawnTemplate?.id ?? null,
    attemptNumber: 1,
    status: DesignRequestStatus.FAILED,
    externalRequestId: "fake-canva-SHAWN-failed-1",
    errorCode: "FAKE_PROVIDER_RENDER_FAILED",
    errorMessage:
      "The simulated Canva adapter failed while rendering the requested template data.",
    requestFingerprint: "seed-SHAWN-failed",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "FAILURE",
      },
      templateId: "seed-SHAWN-static-en",
      contentItemId: ShawnFailed.id,
      attemptNumber: 1,
    },
    resultPayload: {
      stage: "provider_sync",
      error: {
        code: "FAKE_PROVIDER_RENDER_FAILED",
        message:
          "The simulated Canva adapter failed while rendering the requested template data.",
      },
      context: {
        templateId: "seed-SHAWN-static-en",
        requestFingerprint: "seed-SHAWN-failed",
        attemptNumber: 1,
        simulationScenario: "FAILURE",
      },
    },
    createdAt: new Date("2026-04-13T11:40:00.000Z"),
    updatedAt: new Date("2026-04-13T11:58:00.000Z"),
  });

  const sophianYacineBlocked = itemsByKey["SOPHIAN_YACINE-revision-blocked"];
  await ensureStatusEvent(
    sophianYacineBlocked.id,
    ContentStatus.CHANGES_REQUESTED,
    "Editorial changes are still required before this item can move forward.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-12T10:30:00.000Z"),
  );
  await ensureApproval(
    sophianYacineBlocked.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.CHANGES_REQUESTED,
    "Tighten the message before approving it for design.",
    new Date("2026-04-12T10:30:00.000Z"),
  );
  await ensureWorkflowNote(
    sophianYacineBlocked.id,
    juliano.id,
    NoteType.REVISION,
    "Make the opening claim more credible and remove the extra product framing.",
    new Date("2026-04-12T10:50:00.000Z"),
  );

  const ShawnReady = itemsByKey["SHAWN-design-ready"];
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.CONTENT_APPROVED,
    "Content cleared for design before the first provider attempt.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-11T09:15:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 1 created for SHAWN Static English.",
    ContentStatus.CONTENT_APPROVED,
    alina.email,
    new Date("2026-04-11T09:20:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted design attempt 1 before returning malformed output.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-11T09:22:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_FAILED,
    "Attempt 1 failed because the provider returned a malformed design payload during sync.",
    ContentStatus.DESIGN_IN_PROGRESS,
    alina.email,
    new Date("2026-04-11T09:35:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 2 created after the malformed response was reviewed.",
    ContentStatus.DESIGN_FAILED,
    alina.email,
    new Date("2026-04-11T10:00:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted design attempt 2.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-11T10:02:00.000Z"),
  );
  await ensureStatusEvent(
    ShawnReady.id,
    ContentStatus.DESIGN_READY,
    "Design attempt 2 resolved successfully and is ready for review.",
    ContentStatus.DESIGN_IN_PROGRESS,
    alina.email,
    new Date("2026-04-11T10:18:00.000Z"),
  );
  await ensureDesignRequest({
    contentItemId: ShawnReady.id,
    profileMappingId: shawnTemplate?.id ?? null,
    attemptNumber: 1,
    status: DesignRequestStatus.FAILED,
    externalRequestId: "fake-canva-SHAWN-ready-1",
    errorCode: "FAKE_PROVIDER_MALFORMED_RESPONSE",
    errorMessage: "The provider returned an unexpected result shape during sync.",
    requestFingerprint: "seed-SHAWN-ready-attempt-1",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "MALFORMED_RESPONSE",
      },
      templateId: "seed-SHAWN-static-en",
      contentItemId: ShawnReady.id,
      attemptNumber: 1,
    },
    resultPayload: {
      stage: "provider_sync",
      error: {
        code: "FAKE_PROVIDER_MALFORMED_RESPONSE",
        message: "The provider returned an unexpected result shape during sync.",
      },
      context: {
        templateId: "seed-SHAWN-static-en",
        requestFingerprint: "seed-SHAWN-ready-attempt-1",
        attemptNumber: 1,
        simulationScenario: "MALFORMED_RESPONSE",
      },
    },
    createdAt: new Date("2026-04-11T09:20:00.000Z"),
    updatedAt: new Date("2026-04-11T09:35:00.000Z"),
  });
  const readyRequest = await ensureDesignRequest({
    contentItemId: ShawnReady.id,
    profileMappingId: shawnTemplate?.id ?? null,
    attemptNumber: 2,
    status: DesignRequestStatus.READY,
    externalRequestId: "fake-canva-SHAWN-ready-2",
    requestFingerprint: "seed-SHAWN-ready-attempt-2",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "SUCCESS",
      },
      templateId: "seed-SHAWN-static-en",
      contentItemId: ShawnReady.id,
      attemptNumber: 2,
    },
    resultPayload: {
      job: {
        id: "fake-canva-SHAWN-ready-2",
        status: "success",
        result: {
          design_id: "fake-canva-SHAWN-ready-2-design",
          edit_url: "https://fake.canva.local/designs/fake-canva-SHAWN-ready-2/edit",
          thumbnail_url:
            "https://fake.canva.local/designs/fake-canva-SHAWN-ready-2/thumbnail.png",
        },
      },
      meta: {
        simulationScenario: "SUCCESS",
        providerMode: "FAKE_CANVA",
        syncCount: 2,
      },
    },
    createdAt: new Date("2026-04-11T10:00:00.000Z"),
    updatedAt: new Date("2026-04-11T10:18:00.000Z"),
  });
  await ensureAsset({
    id: `${readyRequest.id}-static-image`,
    contentItemId: ShawnReady.id,
    designRequestId: readyRequest.id,
    assetStatus: AssetStatus.READY,
    externalUrl: "https://fake.canva.local/designs/fake-canva-SHAWN-ready-2/thumbnail.png",
    metadata: {
      providerMode: "FAKE_CANVA",
      editUrl: "https://fake.canva.local/designs/fake-canva-SHAWN-ready-2/edit",
    },
    createdAt: new Date("2026-04-11T10:18:00.000Z"),
    updatedAt: new Date("2026-04-11T10:18:00.000Z"),
  });

  const importedIntake = itemsByKey["SHAWN-imported-intake"];
  await ensureStatusEvent(
    importedIntake.id,
    ContentStatus.IMPORTED,
    "The upstream row was normalized and committed, but no editor has picked it up yet.",
    null,
    juliano.email,
    new Date("2026-04-10T14:35:00.000Z"),
  );

  const jobsRouteMissing = itemsByKey["zazmic-jobs-route-missing"];
  await ensureStatusEvent(
    jobsRouteMissing.id,
    ContentStatus.IN_REVIEW,
    "Editorial review finished, but the jobs route still needs a mapped template family.",
    ContentStatus.IMPORTED,
    juliano.email,
    new Date("2026-04-09T14:00:00.000Z"),
  );
  await ensureStatusEvent(
    jobsRouteMissing.id,
    ContentStatus.CONTENT_APPROVED,
    "Content is approved, but the item is parked until a jobs-specific template route exists.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-09T14:25:00.000Z"),
  );
  await ensureApproval(
    jobsRouteMissing.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.APPROVED,
    "Approved once a job-post template route is available.",
    new Date("2026-04-09T14:25:00.000Z"),
  );
  await ensureWorkflowNote(
    jobsRouteMissing.id,
    juliano.id,
    NoteType.COMMENT,
    "Keep this item visible as a routing blocker until the jobs mapping is added.",
    new Date("2026-04-09T14:30:00.000Z"),
  );

  const translationPending = itemsByKey["SHAWN-translation-pending"];
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.CONTENT_APPROVED,
    "Content approval is already recorded for the localized path.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-08T16:15:00.000Z"),
  );
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 1 created for the localized route seed.",
    ContentStatus.CONTENT_APPROVED,
    alina.email,
    new Date("2026-04-08T16:25:00.000Z"),
  );
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted attempt 1 for the localized route seed.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-08T16:27:00.000Z"),
  );
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.DESIGN_READY,
    "Attempt 1 resolved successfully and awaited review.",
    ContentStatus.DESIGN_IN_PROGRESS,
    alina.email,
    new Date("2026-04-08T16:42:00.000Z"),
  );
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.DESIGN_APPROVED,
    "Design approval was recorded before translation review.",
    ContentStatus.DESIGN_READY,
    alina.email,
    new Date("2026-04-08T16:50:00.000Z"),
  );
  await ensureStatusEvent(
    translationPending.id,
    ContentStatus.TRANSLATION_PENDING,
    "The localized version is now waiting on Juliano's translation approval.",
    ContentStatus.DESIGN_APPROVED,
    alina.email,
    new Date("2026-04-08T17:00:00.000Z"),
  );
  await ensureApproval(
    translationPending.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.APPROVED,
    "Approved for downstream design and localization.",
    new Date("2026-04-08T16:15:00.000Z"),
  );
  const translationPendingRequest = await ensureDesignRequest({
    contentItemId: translationPending.id,
    profileMappingId: shawnTemplate?.id ?? null,
    attemptNumber: 1,
    status: DesignRequestStatus.APPROVED,
    externalRequestId: "fake-canva-translation-pending-1",
    requestFingerprint: "seed-translation-pending-1",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "SUCCESS",
      },
      templateId: "seed-SHAWN-static-en",
      contentItemId: translationPending.id,
      attemptNumber: 1,
    },
    resultPayload: {
      job: {
        id: "fake-canva-translation-pending-1",
        status: "approved",
      },
      meta: {
        providerMode: "FAKE_CANVA",
        simulationScenario: "SUCCESS",
      },
    },
    createdAt: new Date("2026-04-08T16:25:00.000Z"),
    updatedAt: new Date("2026-04-08T16:50:00.000Z"),
  });
  await ensureAsset({
    id: `${translationPendingRequest.id}-static-image`,
    contentItemId: translationPending.id,
    designRequestId: translationPendingRequest.id,
    assetStatus: AssetStatus.READY,
    externalUrl: "https://fake.canva.local/designs/fake-canva-translation-pending-1/thumbnail.png",
    metadata: {
      providerMode: "FAKE_CANVA",
      editUrl: "https://fake.canva.local/designs/fake-canva-translation-pending-1/edit",
    },
    createdAt: new Date("2026-04-08T16:42:00.000Z"),
    updatedAt: new Date("2026-04-08T16:50:00.000Z"),
  });

  const readyToPublish = itemsByKey["SOPHIAN_YACINE-ready-to-publish"];
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.CONTENT_APPROVED,
    "Content approval was recorded without changes.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-07T17:10:00.000Z"),
  );
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.DESIGN_REQUESTED,
    "Design attempt 1 created for SOPHIAN_YACINE Static English.",
    ContentStatus.CONTENT_APPROVED,
    alina.email,
    new Date("2026-04-07T17:15:00.000Z"),
  );
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.DESIGN_IN_PROGRESS,
    "Fake Canva accepted design attempt 1.",
    ContentStatus.DESIGN_REQUESTED,
    alina.email,
    new Date("2026-04-07T17:18:00.000Z"),
  );
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.DESIGN_READY,
    "Attempt 1 returned a valid asset for review.",
    ContentStatus.DESIGN_IN_PROGRESS,
    alina.email,
    new Date("2026-04-07T17:32:00.000Z"),
  );
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.DESIGN_APPROVED,
    "Design approval was recorded and packaging prep started.",
    ContentStatus.DESIGN_READY,
    alina.email,
    new Date("2026-04-07T17:45:00.000Z"),
  );
  await ensureStatusEvent(
    readyToPublish.id,
    ContentStatus.READY_TO_PUBLISH,
    "The package, asset link, and operator notes are ready for the publishing handoff.",
    ContentStatus.DESIGN_APPROVED,
    alina.email,
    new Date("2026-04-07T18:00:00.000Z"),
  );
  await ensureApproval(
    readyToPublish.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.APPROVED,
    "Approved without additional revisions.",
    new Date("2026-04-07T17:10:00.000Z"),
  );
  const readyToPublishRequest = await ensureDesignRequest({
    contentItemId: readyToPublish.id,
    profileMappingId: sophianYacineTemplate?.id ?? null,
    attemptNumber: 1,
    status: DesignRequestStatus.APPROVED,
    externalRequestId: "fake-canva-SOPHIAN_YACINE-ready-1",
    requestFingerprint: "seed-SOPHIAN_YACINE-ready-1",
    requestPayload: {
      slice: "canva-v1",
      execution: {
        mode: "FAKE_CANVA",
        simulationScenario: "SUCCESS",
      },
      templateId: "seed-SOPHIAN_YACINE-static-en",
      contentItemId: readyToPublish.id,
      attemptNumber: 1,
    },
    resultPayload: {
      job: {
        id: "fake-canva-SOPHIAN_YACINE-ready-1",
        status: "approved",
      },
      meta: {
        providerMode: "FAKE_CANVA",
        simulationScenario: "SUCCESS",
      },
    },
    createdAt: new Date("2026-04-07T17:15:00.000Z"),
    updatedAt: new Date("2026-04-07T17:45:00.000Z"),
  });
  await ensureAsset({
    id: `${readyToPublishRequest.id}-static-image`,
    contentItemId: readyToPublish.id,
    designRequestId: readyToPublishRequest.id,
    assetStatus: AssetStatus.READY,
    externalUrl: "https://fake.canva.local/designs/fake-canva-SOPHIAN_YACINE-ready-1/thumbnail.png",
    metadata: {
      providerMode: "FAKE_CANVA",
      editUrl: "https://fake.canva.local/designs/fake-canva-SOPHIAN_YACINE-ready-1/edit",
    },
    createdAt: new Date("2026-04-07T17:32:00.000Z"),
    updatedAt: new Date("2026-04-07T17:45:00.000Z"),
  });

  const manualPublished = itemsByKey["SHAWN-manual-published"];
  await ensureStatusEvent(
    manualPublished.id,
    ContentStatus.CONTENT_APPROVED,
    "Content approval is already recorded for the manual fallback example.",
    ContentStatus.IN_REVIEW,
    alina.email,
    new Date("2026-04-06T15:10:00.000Z"),
  );
  await ensureStatusEvent(
    manualPublished.id,
    ContentStatus.DESIGN_APPROVED,
    "The design output was approved and packaged for manual posting.",
    ContentStatus.DESIGN_READY,
    alina.email,
    new Date("2026-04-06T15:25:00.000Z"),
  );
  await ensureStatusEvent(
    manualPublished.id,
    ContentStatus.READY_TO_PUBLISH,
    "The operator package was assembled for manual LinkedIn posting.",
    ContentStatus.DESIGN_APPROVED,
    alina.email,
    new Date("2026-04-06T15:35:00.000Z"),
  );
  await ensureStatusEvent(
    manualPublished.id,
    ContentStatus.PUBLISHED_MANUALLY,
    "Manual LinkedIn fallback completed and the final post URL was retained.",
    ContentStatus.READY_TO_PUBLISH,
    alina.email,
    new Date("2026-04-06T15:50:00.000Z"),
  );
  await ensureApproval(
    manualPublished.id,
    alina.id,
    ApprovalStage.PUBLISH,
    ApprovalDecision.APPROVED,
    "Approved for fallback publishing.",
    new Date("2026-04-06T15:10:00.000Z"),
  );
  await ensureAsset({
    id: `${manualPublished.id}-package`,
    contentItemId: manualPublished.id,
    designRequestId: null,
    assetType: AssetType.EXPORT_PACKAGE,
    assetStatus: AssetStatus.DELIVERED,
    externalUrl: "https://fake.canva.local/exports/SHAWN-manual-published.zip",
    metadata: {
      providerMode: "FAKE_CANVA",
      packageLabel: "Manual fallback package",
      publishedPostUrl: "https://www.linkedin.com/feed/update/seed-published-fallback",
    },
    createdAt: new Date("2026-04-06T15:35:00.000Z"),
    updatedAt: new Date("2026-04-06T15:50:00.000Z"),
  });
  }
}

main()
  .then(async () => {
    await prisma.$disconnect();
    await pool.end();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    await pool.end();
    process.exit(1);
  });
