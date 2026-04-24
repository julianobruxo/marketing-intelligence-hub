import {
  ContentProfile,
  ContentStatus,
  ContentType,
  DesignProvider,
  DesignRequestStatus,
} from "@prisma/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  buildDesignRequestFingerprint,
  buildDesignSourceIdentity,
} from "@/modules/design-orchestration/domain/design-request-fingerprint";

const authMocks = vi.hoisted(() => ({
  requireSession: vi.fn(),
}));

const prismaMocks = vi.hoisted(() => ({
  getPrisma: vi.fn(),
}));

const contractMocks = vi.hoisted(() => ({
  buildDesignInputContract: vi.fn(() => {
    throw new Error("mocked invalid design contract");
  }),
}));

const providerMocks = vi.hoisted(() => ({
  getDesignExecutionProvider: vi.fn(() => ({
    submitRequest: vi.fn(),
    syncRequest: vi.fn(),
  })),
}));

const cacheMocks = vi.hoisted(() => ({
  revalidatePath: vi.fn(),
}));

vi.mock("@/modules/auth/application/auth-service", () => ({
  requireSession: authMocks.requireSession,
}));

vi.mock("@/shared/lib/prisma", () => ({
  getPrisma: prismaMocks.getPrisma,
}));

vi.mock("@/modules/design-orchestration/domain/design-input-contract", () => ({
  buildDesignInputContract: contractMocks.buildDesignInputContract,
}));

vi.mock("@/modules/design-orchestration/infrastructure/design-provider-registry", () => ({
  getDesignExecutionProvider: providerMocks.getDesignExecutionProvider,
}));

vi.mock("next/cache", () => ({
  revalidatePath: cacheMocks.revalidatePath,
}));

function buildSession() {
  return {
    email: "operator@zazmic.com",
    name: "Operator",
    roles: ["ADMIN"],
    mode: "cookie" as const,
  };
}

function buildContentItem(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: "content-item-1",
    canonicalKey: "sheet-1:worksheet-2:row-3",
    title: "Strong title",
    copy: "Final approved copy.",
    contentType: ContentType.STATIC_POST,
    profile: ContentProfile.SHAWN,
    sourceLocale: "en",
    translationRequired: false,
    translationCopy: null,
    preferredDesignProvider: DesignProvider.CANVA,
    currentStatus: ContentStatus.READY_FOR_DESIGN,
    sourceLinks: [
      {
        spreadsheetId: "sheet-1",
        worksheetId: "worksheet-2",
        rowId: "row-3",
      },
    ],
    designRequests: [],
    ...overrides,
  };
}

async function importActualContract() {
  vi.resetModules();
  return vi.importActual<typeof import("@/modules/design-orchestration/domain/design-input-contract")>(
    "@/modules/design-orchestration/domain/design-input-contract",
  );
}

async function importAction() {
  vi.resetModules();
  return import("../modules/design-orchestration/application/run-design-initiation");
}

describe("design request fingerprinting", () => {
  it("prefers the concrete source identifiers when they are available", () => {
    expect(
      buildDesignSourceIdentity({
        canonicalKey: "fallback-canonical-key",
        spreadsheetId: "sheet-123",
        worksheetId: "worksheet-456",
        rowId: "row-789",
      }),
    ).toBe("sheet-123:worksheet-456:row-789");
  });

  it("falls back to the canonical key when row-level source identifiers are missing", () => {
    expect(
      buildDesignSourceIdentity({
        canonicalKey: "fallback-canonical-key",
        spreadsheetId: null,
        worksheetId: undefined,
        rowId: null,
      }),
    ).toBe("fallback-canonical-key");
  });

  it("keeps Canva fingerprints stable when field mappings are reordered", () => {
    const sourceIdentity = "sheet-123:worksheet-456:row-789";
    const left = buildDesignRequestFingerprint({
      provider: DesignProvider.CANVA,
      sourceIdentity,
      templateId: "template-a",
      fieldMappings: {
        title: "headline",
        body: "body-copy",
      },
    });
    const right = buildDesignRequestFingerprint({
      provider: DesignProvider.CANVA,
      sourceIdentity,
      templateId: "template-a",
      fieldMappings: {
        body: "body-copy",
        title: "headline",
      },
    });

    expect(left).toBe(right);
  });

  it("changes the fingerprint when the provider configuration changes", () => {
    const sourceIdentity = "sheet-123:worksheet-456:row-789";
    const left = buildDesignRequestFingerprint({
      provider: DesignProvider.CANVA,
      sourceIdentity,
      templateId: "template-a",
      fieldMappings: {
        title: "headline",
        body: "body-copy",
      },
    });
    const right = buildDesignRequestFingerprint({
      provider: DesignProvider.CANVA,
      sourceIdentity,
      templateId: "template-b",
      fieldMappings: {
        title: "headline",
        body: "body-copy",
      },
    });

    expect(left).not.toBe(right);
  });

  it("separates Nano Banana fingerprints by preset and prompt content", () => {
    const sourceIdentity = "sheet-123:worksheet-456:row-789";
    const left = buildDesignRequestFingerprint({
      provider: DesignProvider.AI_VISUAL,
      sourceIdentity,
      presetId: "preset-a",
      customPrompt: "Make it bright",
      variationCount: 3,
      resolvedPrompt: "Make it bright",
    });
    const right = buildDesignRequestFingerprint({
      provider: DesignProvider.AI_VISUAL,
      sourceIdentity,
      presetId: "preset-b",
      customPrompt: "Make it bright",
      variationCount: 3,
      resolvedPrompt: "Make it bright",
    });

    expect(left).not.toBe(right);
  });
});

describe("design input contract", () => {
  it("builds a validated contract from a content item", async () => {
    const { buildDesignInputContract } = await importActualContract();

    const contract = buildDesignInputContract({
      contentItem: buildContentItem({
        planningSnapshot: {
          planning: {
            platformLabel: "LinkedIn",
            plannedDate: "2026-04-21",
          },
        },
      }) as never,
      templateId: "template-a",
      attemptNumber: 2,
    });

    expect(contract.contentItemId).toBe("content-item-1");
    expect(contract.templateId).toBe("template-a");
    expect(contract.attemptNumber).toBe(2);
    expect(contract.platformLabel).toBe("LinkedIn");
    expect(contract.plannedDate).toBe("2026-04-21");
  });

  it("rejects empty titles at the contract boundary", async () => {
    const { buildDesignInputContract } = await importActualContract();

    expect(() =>
      buildDesignInputContract({
        contentItem: buildContentItem({ title: "" }) as never,
        templateId: "template-a",
        attemptNumber: 1,
      }),
    ).toThrow();
  });
});

describe("design initiation execution ordering", () => {
  beforeEach(() => {
    authMocks.requireSession.mockReset();
    prismaMocks.getPrisma.mockReset();
    contractMocks.buildDesignInputContract.mockClear();
    providerMocks.getDesignExecutionProvider.mockClear();
    cacheMocks.revalidatePath.mockReset();
  });

  afterEach(() => {
    vi.resetModules();
  });

  it("fails before any transaction when the readiness gate rejects the item", async () => {
    authMocks.requireSession.mockResolvedValue(buildSession());

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue(
          buildContentItem({
            title: "",
            designRequests: [],
          }),
        ),
      },
      profileTemplateMapping: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(),
      designRequest: {
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { initiateDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");
    formData.set("templateId", "template-a");

    await expect(initiateDesignRequestAction(formData)).rejects.toMatchObject({
      name: "DesignNotReadyError",
    });

    expect(prisma.profileTemplateMapping.findFirst).not.toHaveBeenCalled();
    expect(contractMocks.buildDesignInputContract).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it("fails before transaction when the validated design contract cannot be built", async () => {
    authMocks.requireSession.mockResolvedValue(buildSession());

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue(
          buildContentItem({
            designRequests: [],
          }),
        ),
      },
      profileTemplateMapping: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mapping-1",
          externalTemplateId: "template-a",
        }),
      },
      $transaction: vi.fn(),
      designRequest: {
        update: vi.fn(),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    const { initiateDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");
    formData.set("templateId", "template-a");

    await expect(initiateDesignRequestAction(formData)).rejects.toMatchObject({
      name: "InvalidDesignContractError",
    });

    expect(prisma.profileTemplateMapping.findFirst).toHaveBeenCalledTimes(1);
    expect(contractMocks.buildDesignInputContract).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(cacheMocks.revalidatePath).not.toHaveBeenCalled();
  });

  it("allows a retry after a rejected design request", async () => {
    authMocks.requireSession.mockResolvedValue(buildSession());
    contractMocks.buildDesignInputContract.mockReturnValue({
      contentItemId: "content-item-1",
      canonicalKey: "sheet-1:worksheet-2:row-3",
      title: "Strong title",
      copy: "Final approved copy.",
      contentType: ContentType.STATIC_POST,
      profile: ContentProfile.SHAWN,
      sourceLocale: "en",
      translationRequired: false,
      attemptNumber: 2,
    } as never);

    const rejectedRequest = {
      id: "design-request-1",
      attemptNumber: 1,
      requestFingerprint: buildDesignRequestFingerprint({
        provider: DesignProvider.CANVA,
        sourceIdentity: "sheet-1:worksheet-2:row-3",
        templateId: "template-a",
        fieldMappings: {
          title: "Strong title",
          body: "Final approved copy.",
        },
      }),
      designProvider: DesignProvider.CANVA,
      status: DesignRequestStatus.REJECTED,
      errorCode: "DESIGN_REJECTED",
      errorMessage: "Rejected design",
      externalRequestId: "job-1",
      requestPayload: {
        templateId: "template-a",
        fieldMappings: {
          title: "Strong title",
          body: "Final approved copy.",
        },
      },
      resultPayload: {},
      deletedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };

    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue(
          buildContentItem({
            currentStatus: ContentStatus.CHANGES_REQUESTED,
            designRequests: [rejectedRequest],
            sourceLinks: [
              {
                spreadsheetId: "sheet-1",
                worksheetId: "worksheet-2",
                rowId: "row-3",
              },
            ],
          }),
        ),
      },
      profileTemplateMapping: {
        findFirst: vi.fn().mockResolvedValue({
          id: "mapping-1",
          externalTemplateId: "template-a",
        }),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          designRequest: {
            create: vi.fn().mockResolvedValue({ id: "design-request-2", attemptNumber: 2 }),
            update: vi.fn().mockResolvedValue(undefined),
          },
          contentItem: {
            update: vi.fn().mockResolvedValue(undefined),
          },
          statusEvent: {
            create: vi.fn().mockResolvedValue(undefined),
          },
          contentAsset: {
            upsert: vi.fn().mockResolvedValue(undefined),
          },
        } as never),
      ),
      designRequest: {
        update: vi.fn().mockResolvedValue(undefined),
      },
      contentAsset: {
        upsert: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    providerMocks.getDesignExecutionProvider.mockReturnValue({
      submitRequest: vi.fn().mockResolvedValue({
        externalRequestId: "job-2",
        payload: {
          accepted: true,
        },
      }),
      syncRequest: vi.fn(),
    });

    const { initiateDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");
    formData.set("templateId", "template-a");
    formData.set("provider", "CANVA");
    formData.set("retryRequested", "true");

    await expect(initiateDesignRequestAction(formData)).resolves.toBeUndefined();

    expect(prisma.$transaction).toHaveBeenCalled();
    expect(prisma.designRequest.update).toHaveBeenCalledTimes(1);
  });

  it("persists reference assets in AI image request prompt metadata", async () => {
    authMocks.requireSession.mockResolvedValue(buildSession());
    contractMocks.buildDesignInputContract.mockReturnValue({
      contentItemId: "content-item-1",
      canonicalKey: "sheet-1:worksheet-2:row-3",
      title: "Strong title",
      copy: "Final approved copy.",
      contentType: ContentType.STATIC_POST,
      profile: ContentProfile.SHAWN,
      sourceLocale: "en",
      translationRequired: false,
      attemptNumber: 1,
      preferredDesignProvider: DesignProvider.GPT_IMAGE,
    } as never);

    const designRequestCreate = vi.fn().mockResolvedValue({
      id: "design-request-1",
      attemptNumber: 1,
    });
    const prisma = {
      contentItem: {
        findFirst: vi.fn().mockResolvedValue(
          buildContentItem({
            preferredDesignProvider: DesignProvider.GPT_IMAGE,
            designRequests: [],
            sourceLinks: [
              {
                spreadsheetId: "sheet-1",
                worksheetId: "worksheet-2",
                rowId: "row-3",
              },
            ],
          }),
        ),
      },
      profileTemplateMapping: {
        findFirst: vi.fn(),
      },
      $transaction: vi.fn(async (callback: (tx: unknown) => Promise<unknown>) =>
        callback({
          designRequest: {
            create: designRequestCreate,
          },
          contentItem: {
            update: vi.fn().mockResolvedValue(undefined),
          },
          statusEvent: {
            create: vi.fn().mockResolvedValue(undefined),
          },
        } as never),
      ),
      designRequest: {
        update: vi.fn().mockResolvedValue(undefined),
      },
    };
    prismaMocks.getPrisma.mockReturnValue(prisma);

    providerMocks.getDesignExecutionProvider.mockReturnValue({
      submitRequest: vi.fn().mockResolvedValue({
        externalRequestId: "gpt-job-1",
        payload: { accepted: true },
      }),
      syncRequest: vi.fn(),
    });

    const { initiateDesignRequestAction } = await importAction();
    const formData = new FormData();
    formData.set("contentItemId", "content-item-1");
    formData.set("provider", "GPT_IMAGE");
    formData.set("presetId", "hook");
    formData.set("customPrompt", "Use this logo carefully.");
    formData.set("variationCount", "2");
    formData.set(
      "referenceAssets",
      JSON.stringify([
        {
          id: "asset-1",
          source: "upload",
          role: "logo",
          displayName: "Logo.png",
          mimeType: "image/png",
          status: "ready",
          dataUrl: "data:image/png;base64,bG9nbw==",
        },
      ]),
    );

    await expect(initiateDesignRequestAction(formData)).resolves.toBeUndefined();

    const createInput = designRequestCreate.mock.calls[0]?.[0] as {
      data?: { requestPayload?: { gptImage?: Record<string, unknown> } };
    };
    const gptImagePayload = createInput.data?.requestPayload?.gptImage;
    const promptRecord = gptImagePayload?.promptRecord as
      | { referenceAssets?: Array<{ role?: string }>; finalPrompt?: string }
      | undefined;

    expect(gptImagePayload?.referenceAssets).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: "asset-1",
          role: "logo",
          status: "ready",
        }),
      ]),
    );
    expect(promptRecord?.referenceAssets?.[0]?.role).toBe("logo");
    expect(promptRecord?.finalPrompt).toContain("Reference assets:");
  });
});
