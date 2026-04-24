"use server";

import "server-only";

import {
  AppRole,
  AssetStatus,
  AssetType,
  ContentProfile,
  ContentStatus,
  ContentType,
  DesignProvider,
  DesignRequestStatus,
  ImportMode,
  ImportReceiptStatus,
  OrchestratorType,
  Prisma,
  type ProfileTemplateMapping,
  type User,
} from "@prisma/client";
import { getPrisma } from "@/shared/lib/prisma";
import { logEvent } from "@/shared/logging/logger";

export type E2eSeedKind =
  | "canva-ready"
  | "nb-ready"
  | "design-ready-canva"
  | "design-ready-nb"
  | "design-failed-canva"
  | "design-failed-exhausted-canva"
  | "ready-to-post";

export type TestUserRole = "user" | "admin";

const SHAWN_CANVA_TEMPLATE_IDS = ["shawn-static-en-01", "shawn-static-en-02", "shawn-static-en-03"] as const;

function toJsonValue(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function buildPlanningSnapshot(input: {
  title: string;
  copy: string;
  spreadsheetName: string;
  worksheetName: string;
  currentStatus: ContentStatus;
  isPublished?: boolean;
}) {
  return toJsonValue({
    planning: {
      titleDerivation: {
        title: input.title,
        strategy: "e2e-fixture",
        sourceField: "copyEnglish",
      },
      copyEnglish: input.copy,
      campaignLabel: input.title,
      platformLabel: "LinkedIn",
      plannedDate: "2026-04-21",
      contentDeadline: "2026-04-21",
    },
    source: {
      spreadsheetName: input.spreadsheetName,
      worksheetName: input.worksheetName,
    },
    sourceMetadata: {
      owner: "E2E Fixture",
      sourceGroup: "Shawn",
      extra: {
        aiSemantic: {
          has_editorial_brief: true,
          has_final_copy: true,
          is_published: input.isPublished === true,
          is_overdue: false,
          is_empty_or_unusable: false,
          needs_human_review: false,
        },
      },
    },
    workflow: {
      status: input.currentStatus,
    },
  });
}

async function ensureShawnCanvaMappings(): Promise<Record<string, ProfileTemplateMapping>> {
  const prisma = getPrisma();
  const mappings: Record<string, ProfileTemplateMapping> = {};

  for (const externalTemplateId of SHAWN_CANVA_TEMPLATE_IDS) {
    const existing = await prisma.profileTemplateMapping.findFirst({
      where: {
        profile: ContentProfile.SHAWN,
        contentType: ContentType.STATIC_POST,
        locale: "en",
        designProvider: DesignProvider.CANVA,
        externalTemplateId,
      },
    });

    const mapping =
      existing ??
      (await prisma.profileTemplateMapping.create({
        data: {
          profile: ContentProfile.SHAWN,
          contentType: ContentType.STATIC_POST,
          locale: "en",
          designProvider: DesignProvider.CANVA,
          externalTemplateId,
          displayName: externalTemplateId.replaceAll("-", " "),
          isActive: true,
        },
      }));

    if (!existing) {
      mappings[externalTemplateId] = mapping;
      continue;
    }

    const updated = await prisma.profileTemplateMapping.update({
      where: { id: existing.id },
      data: {
        isActive: true,
      },
    });

    mappings[externalTemplateId] = updated;
  }

  return mappings;
}

export async function ensureTestUserWithRoles(role: TestUserRole): Promise<User> {
  const prisma = getPrisma();
  const email = role === "admin" ? "alina@zazmic.com" : "juliano@zazmic.com";
  const name = role === "admin" ? "Alina" : "Juliano";
  const roles = role === "admin" ? [AppRole.ADMIN, AppRole.APPROVER] : [AppRole.EDITOR];

  const user = await prisma.user.upsert({
    where: { email },
    update: {
      name,
      isActive: true,
    },
    create: {
      email,
      name,
      isActive: true,
    },
  });

  await prisma.userRole.deleteMany({
    where: { userId: user.id },
  });

  if (roles.length > 0) {
    await prisma.userRole.createMany({
      data: roles.map((entry) => ({
        userId: user.id,
        role: entry,
      })),
      skipDuplicates: true,
    });
  }

  return user;
}

export async function cleanupE2eData() {
  const prisma = getPrisma();
  const [receiptsDeleted, rowsDeleted, batchesDeleted, itemsDeleted] = await prisma.$transaction([
    prisma.importReceipt.deleteMany({}),
    prisma.spreadsheetImportRow.deleteMany({}),
    prisma.spreadsheetImportBatch.deleteMany({}),
    prisma.contentItem.deleteMany({}),
  ]);

  logEvent("info", "[E2E] Cleanup complete", {
    receiptsDeleted: receiptsDeleted.count,
    rowsDeleted: rowsDeleted.count,
    batchesDeleted: batchesDeleted.count,
    itemsDeleted: itemsDeleted.count,
  });

  return {
    receiptsDeleted: receiptsDeleted.count,
    rowsDeleted: rowsDeleted.count,
    batchesDeleted: batchesDeleted.count,
    itemsDeleted: itemsDeleted.count,
  };
}

export async function seedContentItem(kind: E2eSeedKind) {
  const prisma = getPrisma();
  const mappings = await ensureShawnCanvaMappings();
  const now = new Date();

  const seed = buildSeedSpec(kind);

  await prisma.contentItem.deleteMany({
    where: { canonicalKey: seed.canonicalKey },
  });

  const contentItem = await prisma.contentItem.create({
    data: {
      canonicalKey: seed.canonicalKey,
      profile: seed.profile,
      contentType: ContentType.STATIC_POST,
      title: seed.title,
      copy: seed.copy,
      sourceLocale: "en",
      translationRequired: false,
      translationStatus: seed.currentStatus === ContentStatus.READY_TO_POST ? "NOT_REQUIRED" : "NOT_REQUIRED",
      preferredDesignProvider: seed.preferredDesignProvider,
      autopostEnabled: seed.currentStatus === ContentStatus.READY_TO_POST,
      currentStatus: seed.currentStatus,
      latestImportAt: now,
      planningSnapshot: buildPlanningSnapshot({
        title: seed.title,
        copy: seed.copy,
        spreadsheetName: seed.spreadsheetName,
        worksheetName: seed.worksheetName,
        currentStatus: seed.currentStatus,
        isPublished: seed.currentStatus === ContentStatus.POSTED,
      }),
      sourceLinks: {
        create: {
          upstreamSystem: "GOOGLE_SHEETS",
          sheetProfileKey: "e2e-shawn-static",
          sheetProfileVersion: 1,
          spreadsheetId: seed.spreadsheetId,
          worksheetId: seed.worksheetId,
          worksheetName: seed.worksheetName,
          rowId: seed.rowId,
          rowNumber: 1,
          rowVersion: "e2e-v1",
          lastFingerprint: `${seed.canonicalKey}-fingerprint`,
          pushbackEnabled: false,
        },
      },
      importReceipts: {
        create: {
          idempotencyKey: `${seed.canonicalKey}-import`,
          mode: ImportMode.COMMIT,
          orchestrator: OrchestratorType.MANUAL,
          upstreamSystem: "GOOGLE_SHEETS",
          sheetProfileKey: "e2e-shawn-static",
          sheetProfileVersion: 1,
          status: ImportReceiptStatus.PROCESSED,
          payloadVersion: 1,
          fingerprint: `${seed.canonicalKey}-fingerprint`,
          payload: toJsonValue({
            kind,
            spreadsheetId: seed.spreadsheetId,
            worksheetName: seed.worksheetName,
          }),
          processedAt: now,
        },
      },
      statusEvents: {
        create: {
          fromStatus: seed.previousStatus,
          toStatus: seed.currentStatus,
          actorEmail: "e2e@test.local",
          note: seed.statusNote,
        },
      },
      designRequests: seed.designRequest
        ? {
            create: {
              designProvider: seed.designRequest.designProvider,
              requestFingerprint: seed.designRequest.requestFingerprint,
              attemptNumber: seed.designRequest.attemptNumber,
              status: seed.designRequest.status,
              externalRequestId: seed.designRequest.externalRequestId,
              errorCode: seed.designRequest.errorCode ?? null,
              errorMessage: seed.designRequest.errorMessage ?? null,
              requestPayload: toJsonValue(seed.designRequest.requestPayload),
              resultPayload: toJsonValue(seed.designRequest.resultPayload),
              profileMappingId: seed.designRequest.templateId
                ? mappings[seed.designRequest.templateId]?.id ?? null
                : null,
            },
          }
        : undefined,
    },
    include: {
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (seed.asset) {
    const latestDesignRequest = contentItem.designRequests[0] ?? null;

    await prisma.contentAsset.create({
      data: {
        contentItemId: contentItem.id,
        designRequestId: latestDesignRequest?.id ?? null,
        assetType: AssetType.STATIC_IMAGE,
        assetStatus: AssetStatus.READY,
        locale: "en",
        externalUrl: seed.asset.externalUrl,
        storagePath: seed.asset.storagePath ?? null,
        metadata: toJsonValue(seed.asset.metadata),
      },
    });
  }

  logEvent("info", "[E2E] Seeded content item", {
    kind,
    contentItemId: contentItem.id,
    canonicalKey: seed.canonicalKey,
    status: seed.currentStatus,
  });

  return {
    id: contentItem.id,
    canonicalKey: seed.canonicalKey,
    kind,
    title: seed.title,
    status: seed.currentStatus,
    designProvider: seed.preferredDesignProvider,
  };
}

function buildSeedSpec(kind: E2eSeedKind): {
  canonicalKey: string;
  profile: ContentProfile;
  title: string;
  copy: string;
  spreadsheetId: string;
  worksheetId: string;
  worksheetName: string;
  rowId: string;
  spreadsheetName: string;
  currentStatus: ContentStatus;
  previousStatus: ContentStatus;
  preferredDesignProvider: DesignProvider | null;
  statusNote: string;
  designRequest:
    | {
        designProvider: DesignProvider;
        requestFingerprint: string;
        attemptNumber: number;
        status: DesignRequestStatus;
        externalRequestId: string | null;
        errorCode?: string | null;
        errorMessage?: string | null;
        templateId?: string | null;
        requestPayload: Record<string, unknown>;
        resultPayload: Record<string, unknown>;
      }
    | null;
  asset:
    | {
        externalUrl: string;
        storagePath: string | null;
        metadata: Record<string, unknown>;
      }
    | null;
} {
  const base = {
    profile: ContentProfile.SHAWN,
    spreadsheetId: `e2e-${kind}-sheet`,
    worksheetId: `e2e-${kind}-worksheet`,
    worksheetName: "E2E Planner",
    rowId: "row-1",
    spreadsheetName: "E2E Fixture Sheet",
  };

  switch (kind) {
    case "canva-ready":
      return {
        ...base,
        canonicalKey: "e2e-canva-ready",
        title: "E2E Canva Ready",
        copy: "Copy ready for Canva design initiation.",
        currentStatus: ContentStatus.READY_FOR_DESIGN,
        previousStatus: ContentStatus.IMPORTED,
        preferredDesignProvider: DesignProvider.CANVA,
        statusNote: "Seeded as ready for design.",
        designRequest: null,
        asset: null,
      };
    case "nb-ready":
      return {
        ...base,
        canonicalKey: "e2e-nb-ready",
        title: "E2E Nano Banana Ready",
        copy: "Copy ready for Nano Banana design initiation.",
        currentStatus: ContentStatus.READY_FOR_DESIGN,
        previousStatus: ContentStatus.IMPORTED,
        preferredDesignProvider: DesignProvider.AI_VISUAL,
        statusNote: "Seeded as ready for design.",
        designRequest: null,
        asset: null,
      };
    case "design-ready-canva":
      return {
        ...base,
        canonicalKey: "e2e-design-ready-canva",
        title: "E2E Canva Design Ready",
        copy: "Copy that already completed a Canva design sync.",
        currentStatus: ContentStatus.DESIGN_READY,
        previousStatus: ContentStatus.READY_FOR_DESIGN,
        preferredDesignProvider: DesignProvider.CANVA,
        statusNote: "Seeded as design ready for Canva approval.",
        designRequest: {
          designProvider: DesignProvider.CANVA,
          requestFingerprint: "e2e-design-ready-canva-fp",
          attemptNumber: 1,
          status: DesignRequestStatus.READY,
          externalRequestId: "e2e-design-ready-canva-job",
          templateId: "shawn-static-en-01",
          requestPayload: {
            provider: "CANVA",
            templateId: "shawn-static-en-01",
            fieldMappings: {
              TITLE: "E2E Canva Design Ready",
              BODY: "Copy that already completed a Canva design sync.",
            },
          },
          resultPayload: {
            canva: {
              designUrl: "https://mock.design.local/e2e-canva-ready",
              thumbnailUrl: "https://mock.design.local/e2e-canva-ready-thumb",
            },
          },
        },
        asset: {
          externalUrl: "https://mock.design.local/e2e-canva-ready-thumb",
          storagePath: null,
          metadata: {
            providerMode: "MOCK",
            designId: "e2e-design-ready-canva-job",
            editUrl: "https://mock.design.local/e2e-canva-ready/edit",
          },
        },
      };
    case "design-ready-nb":
      return {
        ...base,
        canonicalKey: "e2e-design-ready-nb",
        title: "E2E Nano Banana Design Ready",
        copy: "Copy that already completed a Nano Banana sync.",
        currentStatus: ContentStatus.DESIGN_READY,
        previousStatus: ContentStatus.READY_FOR_DESIGN,
        preferredDesignProvider: DesignProvider.AI_VISUAL,
        statusNote: "Seeded as design ready for Nano Banana approval.",
        designRequest: {
          designProvider: DesignProvider.AI_VISUAL,
          requestFingerprint: "e2e-design-ready-nb-fp",
          attemptNumber: 1,
          status: DesignRequestStatus.READY,
          externalRequestId: "e2e-design-ready-nb-job",
          requestPayload: {
            provider: "AI_VISUAL",
            presetId: "hook",
            customPrompt: "",
            variationCount: 2,
            nanoBanana: {
              resolvedPrompt: "Create a high-impact LinkedIn static post for Zazmic Inc.",
            },
          },
          resultPayload: {
            nanoBanana: {
              variations: [
                {
                  id: "nb-var-1",
                  label: "Variation 1",
                  thumbnailUrl: "https://mock.design.local/e2e-nb-var-1.png",
                  editUrl: "https://mock.design.local/e2e-nb-var-1/edit",
                },
                {
                  id: "nb-var-2",
                  label: "Variation 2",
                  thumbnailUrl: "https://mock.design.local/e2e-nb-var-2.png",
                  editUrl: "https://mock.design.local/e2e-nb-var-2/edit",
                },
              ],
            },
          },
        },
        asset: {
          externalUrl: "https://mock.design.local/e2e-nb-var-1.png",
          storagePath: null,
          metadata: {
            providerMode: "MOCK_NB",
            designId: "e2e-design-ready-nb-job",
          },
        },
      };
    case "design-failed-canva":
      return {
        ...base,
        canonicalKey: "e2e-design-failed-canva",
        title: "E2E Canva Design Failed",
        copy: "Copy for the retry flow after a Canva failure.",
        currentStatus: ContentStatus.DESIGN_FAILED,
        previousStatus: ContentStatus.READY_FOR_DESIGN,
        preferredDesignProvider: DesignProvider.CANVA,
        statusNote: "Seeded as design failed with retry available.",
        designRequest: {
          designProvider: DesignProvider.CANVA,
          requestFingerprint: "e2e-design-failed-canva-fp",
          attemptNumber: 1,
          status: DesignRequestStatus.FAILED,
          externalRequestId: "e2e-design-failed-canva-job",
          errorCode: "E2E_CANVA_RENDER_FAILED",
          errorMessage: "E2E fixture Canva render failed.",
          templateId: "shawn-static-en-02",
          requestPayload: {
            provider: "CANVA",
            templateId: "shawn-static-en-02",
            fieldMappings: {
              TITLE: "E2E Canva Design Failed",
              BODY: "Copy for the retry flow after a Canva failure.",
            },
          },
          resultPayload: {
            error: {
              code: "E2E_CANVA_RENDER_FAILED",
              message: "E2E fixture Canva render failed.",
            },
          },
        },
        asset: null,
      };
    case "design-failed-exhausted-canva":
      return {
        ...base,
        canonicalKey: "e2e-design-failed-exhausted-canva",
        title: "E2E Canva Design Exhausted",
        copy: "Copy for the exhausted retry flow.",
        currentStatus: ContentStatus.DESIGN_FAILED,
        previousStatus: ContentStatus.READY_FOR_DESIGN,
        preferredDesignProvider: DesignProvider.CANVA,
        statusNote: "Seeded as design failed with retries exhausted.",
        designRequest: {
          designProvider: DesignProvider.CANVA,
          requestFingerprint: "e2e-design-failed-exhausted-canva-fp",
          attemptNumber: 3,
          status: DesignRequestStatus.FAILED,
          externalRequestId: "e2e-design-failed-exhausted-canva-job",
          errorCode: "E2E_CANVA_RENDER_FAILED",
          errorMessage: "E2E fixture Canva render failed.",
          templateId: "shawn-static-en-03",
          requestPayload: {
            provider: "CANVA",
            templateId: "shawn-static-en-03",
            fieldMappings: {
              TITLE: "E2E Canva Design Exhausted",
              BODY: "Copy for the exhausted retry flow.",
            },
          },
          resultPayload: {
            error: {
              code: "E2E_CANVA_RENDER_FAILED",
              message: "E2E fixture Canva render failed.",
            },
          },
        },
        asset: null,
      };
    case "ready-to-post":
      return {
        ...base,
        canonicalKey: "e2e-ready-to-post",
        title: "E2E Ready To Post",
        copy: "Copy ready for the publication action.",
        currentStatus: ContentStatus.READY_TO_POST,
        previousStatus: ContentStatus.DESIGN_APPROVED,
        preferredDesignProvider: DesignProvider.CANVA,
        statusNote: "Seeded as ready to post.",
        designRequest: null,
        asset: {
          externalUrl: "https://mock.design.local/e2e-ready-to-post.png",
          storagePath: null,
          metadata: {
            providerMode: "MOCK",
          },
        },
      };
  }

  throw new Error(`Unknown E2E seed kind: ${kind}`);
}
