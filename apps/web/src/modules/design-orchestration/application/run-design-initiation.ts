"use server";

import {
  AssetStatus,
  AssetType,
  ContentProfile,
  ContentStatus,
  DesignProvider,
  DesignRequestStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { CANVA_PROVIDER_MODE, GPT_IMAGE_PROVIDER_MODE, NB_PROVIDER_MODE } from "@/shared/config/env";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import { getActorEmail } from "@/modules/workflow/application/get-actor-email";
import { parseDesignSimulationScenario } from "../domain/design-provider";
import { CANVA_SLICE_V1, isSliceOneCanvaEligible } from "../domain/canva-slice";
import { getDesignExecutionProvider } from "../infrastructure/design-provider-registry";
import { buildDesignInputContract } from "../domain/design-input-contract";
import { evaluateDesignReadiness } from "../domain/design-readiness-gate";
import { DESIGN_MAX_AUTO_RETRIES } from "../domain/design-workflow-contract";
import { buildImageGenerationPromptRecord, type ImageGenerationPromptRecord } from "../domain/build-image-prompt";
import { deriveDesignContextFromCard } from "../domain/derive-design-context";
import { resolveDesignPreset } from "../domain/design-presets";
import {
  parseReferenceAssetsFormValue,
  type DesignReferenceAsset,
} from "../domain/design-reference-assets";
import {
  buildDesignRequestFingerprint,
  buildDesignSourceIdentity,
} from "../domain/design-request-fingerprint";
import { MAX_SYNC_FAILURES } from "../domain/design-sync-config";
import {
  appendDesignSyncFailure,
  getDesignSyncFailureCount,
  getDesignSyncState,
  mergeDesignSyncPayload,
} from "../domain/design-sync-state";

function toJsonValue(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function toRecord(payload: unknown): Record<string, unknown> {
  return payload && typeof payload === "object" && !Array.isArray(payload)
    ? (payload as Record<string, unknown>)
    : {};
}

function formatDesignAuthor(profile: ContentProfile): string {
  switch (profile) {
    case ContentProfile.YANN:
      return "Yann";
    case ContentProfile.YURI:
      return "Yuri";
    case ContentProfile.SHAWN:
      return "Shawn";
    case ContentProfile.SOPHIAN_YACINE:
      return "Sophian Yacine";
    case ContentProfile.ZAZMIC_PAGE:
      return "Zazmic Page";
    default:
      return String(profile).toLowerCase().replaceAll("_", " ");
  }
}

type DesignFailureWriter = Pick<
  Prisma.TransactionClient,
  "designRequest" | "contentItem" | "statusEvent"
>;

class DesignNotReadyError extends Error {
  reasons: string[];

  constructor(reasons: string[]) {
    super("Design request is not ready.");
    this.name = "DesignNotReadyError";
    this.reasons = reasons;
  }
}

class InvalidDesignContractError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidDesignContractError";
  }
}

function buildFailurePayload(input: {
  error: unknown;
  stage: string;
  retryable?: boolean;
  resultPayload?: unknown;
}) {
  const message =
    input.error instanceof Error ? input.error.message : "Unknown design-provider failure.";
  const code =
    input.error instanceof Error && input.error.name && input.error.name !== "Error"
      ? input.error.name
      : "DESIGN_PROVIDER_REQUEST_FAILED";

  const basePayload =
    toRecord(input.resultPayload);

  return {
    ...basePayload,
    stage: input.stage,
    retryable: input.retryable ?? false,
    error: { code, message },
  };
}

async function writeFailure(tx: DesignFailureWriter, input: {
  designRequestId: string;
  contentItemId: string;
  previousStatus: ContentStatus;
  sessionEmail: string;
  error: unknown;
  stage: string;
  retryable?: boolean;
  resultPayload?: unknown;
}) {
  const failurePayload = buildFailurePayload(input);

  assertContentStatusTransition({
    currentStatus: input.previousStatus,
    nextStatus: ContentStatus.DESIGN_FAILED,
    reason: `design ${input.stage} failure`,
  });

  await tx.designRequest.update({
    where: { id: input.designRequestId },
    data: {
      status: DesignRequestStatus.FAILED,
      errorCode: failurePayload.error.code,
      errorMessage: failurePayload.error.message,
      resultPayload: toJsonValue(failurePayload),
    },
  });
  await tx.contentItem.update({
    where: { id: input.contentItemId },
    data: { currentStatus: ContentStatus.DESIGN_FAILED },
  });
  await tx.statusEvent.create({
    data: {
      contentItemId: input.contentItemId,
      fromStatus: input.previousStatus,
      toStatus: ContentStatus.DESIGN_FAILED,
      actorEmail: input.sessionEmail,
      note: `Design attempt failed at ${input.stage}: ${failurePayload.error.message}`,
    },
  });
}

async function recordFailure(input: {
  designRequestId: string;
  contentItemId: string;
  previousStatus: ContentStatus;
  sessionEmail: string;
  error: unknown;
  stage: string;
  retryable?: boolean;
  resultPayload?: unknown;
}) {
  const prisma = getPrisma();
  await prisma.$transaction(async (tx) => {
    await writeFailure(tx, input);
  });
}

export async function initiateDesignRequestAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();

  const contentItemId = String(formData.get("contentItemId") ?? "");
  const providerRaw = String(formData.get("provider") ?? "CANVA");
  const retryRequested = String(formData.get("retryRequested") ?? "false") === "true";
  const scenario = parseDesignSimulationScenario(formData.get("designScenario"));

  if (!contentItemId) return;

  const provider =
    providerRaw === "GPT_IMAGE"
      ? DesignProvider.GPT_IMAGE
      : providerRaw === "AI_VISUAL"
        ? DesignProvider.AI_VISUAL
        : DesignProvider.CANVA;

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      sourceLinks: {
        orderBy: { createdAt: "desc" },
        take: 1,
      },
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!contentItem) return;

  if (
    !isSliceOneCanvaEligible({
      profile: contentItem.profile,
      contentType: contentItem.contentType,
      sourceLocale: contentItem.sourceLocale,
    })
  ) {
    return;
  }

  const activeDesignRequestExists = contentItem.designRequests.some(
    (request) =>
      request.status === DesignRequestStatus.REQUESTED ||
      request.status === DesignRequestStatus.IN_PROGRESS,
  );

  const readiness = evaluateDesignReadiness({
    currentStatus: contentItem.currentStatus,
    copy: contentItem.copy,
    title: contentItem.title,
    contentType: contentItem.contentType,
    sourceLocale: contentItem.sourceLocale,
    hasActiveDesignRequest: activeDesignRequestExists,
  });

  if (!readiness.eligible) {
    throw new DesignNotReadyError(readiness.reasons);
  }

  const sourceLink = contentItem.sourceLinks[0] ?? null;
  const sourceIdentity = buildDesignSourceIdentity({
    canonicalKey: contentItem.canonicalKey,
    spreadsheetId: sourceLink?.spreadsheetId,
    worksheetId: sourceLink?.worksheetId,
    rowId: sourceLink?.rowId,
  });

  let profileMappingId: string | null = null;
  let resolvedTemplateId: string | null = null;
  let fieldMappings: Record<string, string> = {};
  let presetId: string | null = null;
  let customPrompt: string | null = null;
  let variationCount = 3;
  let resolvedPrompt: string | null = null;
  let promptRecord: ImageGenerationPromptRecord | null = null;
  let referenceAssets: DesignReferenceAsset[] = [];

  if (provider === DesignProvider.CANVA) {
    const templateId = String(formData.get("templateId") ?? "");

    const profileMapping = await prisma.profileTemplateMapping.findFirst({
      where: {
        externalTemplateId: templateId || undefined,
        profile: CANVA_SLICE_V1.profile,
        contentType: CANVA_SLICE_V1.contentType,
        locale: CANVA_SLICE_V1.locale,
        designProvider: DesignProvider.CANVA,
        isActive: true,
      },
    });

    if (!profileMapping) return;

    profileMappingId = profileMapping.id;
    resolvedTemplateId = profileMapping.externalTemplateId;

    try {
      const raw = formData.get("fieldMappings");
      if (typeof raw === "string" && raw.trim().startsWith("{")) {
        fieldMappings = JSON.parse(raw) as Record<string, string>;
      }
    } catch {
      fieldMappings = {};
    }

    if (!fieldMappings[CANVA_SLICE_V1.datasetFields.title]) {
      fieldMappings[CANVA_SLICE_V1.datasetFields.title] = contentItem.title;
    }
    if (!fieldMappings[CANVA_SLICE_V1.datasetFields.body]) {
      fieldMappings[CANVA_SLICE_V1.datasetFields.body] = contentItem.copy;
    }
  } else {
    presetId = String(formData.get("presetId") ?? "");
    customPrompt = String(formData.get("customPrompt") ?? "").trim();
    variationCount = Math.max(
      1,
      Math.min(4, Number(formData.get("variationCount") ?? "3") || 3),
    );
    referenceAssets = parseReferenceAssetsFormValue(formData.get("referenceAssets"));
    const preset = resolveDesignPreset(presetId || null);
    const author = String(formData.get("author") ?? "").trim() || formatDesignAuthor(contentItem.profile);
    const derivedContext = deriveDesignContextFromCard({
      title: contentItem.title,
      author,
      copy: contentItem.copy,
    });
    promptRecord = buildImageGenerationPromptRecord({
      preset,
      derivedContext,
      customPrompt: customPrompt || null,
      variations: variationCount,
      referenceAssets,
    });
    presetId = promptRecord.presetId;
    resolvedPrompt = promptRecord.finalPrompt;
  }

  const providerRequests = contentItem.designRequests.filter(
    (request) => request.designProvider === provider,
  );

  const fingerprint =
    provider === DesignProvider.CANVA
      ? buildDesignRequestFingerprint({
          provider,
          sourceIdentity,
          templateId: resolvedTemplateId,
          fieldMappings,
        })
      : buildDesignRequestFingerprint({
          provider,
          sourceIdentity,
          presetId,
          customPrompt,
          variationCount,
          resolvedPrompt,
          referenceAssets,
        });

  const matching = providerRequests.filter((request) => request.requestFingerprint === fingerprint);

  const activeRequest = matching.find(
    (request) =>
      request.status === DesignRequestStatus.REQUESTED ||
      request.status === DesignRequestStatus.IN_PROGRESS,
  );
  if (activeRequest) return;

  const completed = matching.find(
    (request) =>
      request.status === DesignRequestStatus.READY ||
      request.status === DesignRequestStatus.APPROVED ||
      request.status === DesignRequestStatus.COMPLETED,
  );
  if (completed && !retryRequested) return;

  const latestAttempt = matching[0]?.attemptNumber ?? 0;
  const hasFailedMatchingAttempt = matching.some(
    (request) => request.status === DesignRequestStatus.FAILED,
  );
  const nextAttemptNumber =
    retryRequested ||
    contentItem.currentStatus === ContentStatus.DESIGN_FAILED ||
    hasFailedMatchingAttempt
      ? latestAttempt + 1
      : latestAttempt === 0
        ? 1
        : latestAttempt;

  if (nextAttemptNumber > DESIGN_MAX_AUTO_RETRIES) return;

  let designContract;
  try {
    designContract = buildDesignInputContract({
      contentItem,
      templateId: resolvedTemplateId ?? undefined,
      attemptNumber: nextAttemptNumber,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Invalid design contract.";
    throw new InvalidDesignContractError(message);
  }

  let requestPayload: Prisma.InputJsonValue;

  if (provider === DesignProvider.CANVA) {
    const includeMockExecution = CANVA_PROVIDER_MODE !== "REAL";
    requestPayload = toJsonValue({
      slice: "canva-v1",
      templateFamily: CANVA_SLICE_V1.templateFamily,
      templateId: resolvedTemplateId,
      contentItemId: contentItem.id,
      attemptNumber: nextAttemptNumber,
      sentBy: session.email,
      fieldMappings,
      data: fieldMappings,
      ...(includeMockExecution
        ? {
            execution: { mode: "MOCK" as const, simulationScenario: scenario },
          }
        : {}),
    });
  } else {
    const isGptImageProvider = provider === DesignProvider.GPT_IMAGE;
    const includeMockExecution = isGptImageProvider
      ? GPT_IMAGE_PROVIDER_MODE !== "REAL"
      : NB_PROVIDER_MODE !== "REAL";
    requestPayload = toJsonValue({
      slice: isGptImageProvider ? "gpt-image-v1" : "nano-banana-v1",
      contentItemId: contentItem.id,
      attemptNumber: nextAttemptNumber,
      sentBy: session.email,
      ...(isGptImageProvider
        ? {
            gptImage: {
              presetId: promptRecord?.presetId ?? presetId ?? null,
              presetPrompt: promptRecord?.presetPrompt ?? null,
              customPrompt: promptRecord?.customPrompt ?? (customPrompt || null),
              finalPrompt: promptRecord?.finalPrompt ?? resolvedPrompt,
              resolvedPrompt,
              variationCount,
              referenceAssets,
              promptRecord,
            },
          }
        : {}),
      nanoBanana: {
        presetId: promptRecord?.presetId ?? presetId ?? null,
        presetPrompt: promptRecord?.presetPrompt ?? null,
        customPrompt: promptRecord?.customPrompt ?? (customPrompt || null),
        finalPrompt: promptRecord?.finalPrompt ?? resolvedPrompt,
        resolvedPrompt,
        variationCount,
        referenceAssets,
        promptRecord,
      },
      ...(includeMockExecution
        ? {
            execution: { mode: "MOCK" as const, simulationScenario: scenario },
          }
        : {}),
    });
  }

  let designRequest: { id: string; attemptNumber: number } | undefined;

  try {
    assertContentStatusTransition({
      currentStatus: contentItem.currentStatus,
      nextStatus: ContentStatus.IN_DESIGN,
      reason: "creating a design request",
    });

    designRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.designRequest.create({
        data: {
          contentItemId: contentItem.id,
          profileMappingId,
          designProvider: provider,
          requestFingerprint: fingerprint,
          attemptNumber: nextAttemptNumber,
          status: DesignRequestStatus.REQUESTED,
          requestPayload,
        },
        select: { id: true, attemptNumber: true },
      });

      await tx.contentItem.update({
        where: { id: contentItem.id },
        data: { currentStatus: ContentStatus.IN_DESIGN },
      });

      const providerLabel =
        provider === DesignProvider.CANVA
          ? "Canva"
          : provider === DesignProvider.GPT_IMAGE
            ? "GPT Image 2"
            : "Nano Banana 2";
      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: contentItem.currentStatus,
          toStatus: ContentStatus.IN_DESIGN,
          actorEmail: session.email,
          note: `Design attempt ${nextAttemptNumber} submitted via ${providerLabel}.`,
        },
      });

      return created;
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      revalidatePath(`/queue/${contentItem.id}`);
      revalidatePath("/queue");
      return;
    }

    throw error;
  }

  const executionProvider = getDesignExecutionProvider(provider);

  try {
    const submitted = await executionProvider.submitRequest({
      ...designContract,
      scenario,
      requestPayload,
    });

    await prisma.designRequest.update({
      where: { id: designRequest.id },
      data: {
        externalRequestId: submitted.externalRequestId,
        status: DesignRequestStatus.IN_PROGRESS,
        resultPayload: toJsonValue(submitted.payload),
      },
    });
  } catch (error) {
    await recordFailure({
      designRequestId: designRequest.id,
      contentItemId: contentItem.id,
      previousStatus: ContentStatus.IN_DESIGN,
      sessionEmail: session.email,
      error,
      stage: "provider_submit",
    });
  }

  revalidatePath(`/queue/${contentItem.id}`);
  revalidatePath("/queue");
}

export async function syncDesignRequestAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();

  const contentItemId = String(formData.get("contentItemId") ?? "");
  if (!contentItemId) return;

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!contentItem) return;

  const activeRequest = contentItem.designRequests.find(
    (request) =>
      request.status === DesignRequestStatus.REQUESTED ||
      request.status === DesignRequestStatus.IN_PROGRESS,
  );

  if (!activeRequest?.externalRequestId) return;

  const executionProvider = getDesignExecutionProvider(activeRequest.designProvider);
  const actorEmail = await getActorEmail(session.email);

  try {
    const syncResult = await executionProvider.syncRequest({
      externalRequestId: activeRequest.externalRequestId,
      requestPayload: activeRequest.requestPayload,
      resultPayload: activeRequest.resultPayload,
    });

    if (syncResult.state === "IN_PROGRESS") {
      const mergedPayload = mergeDesignSyncPayload(activeRequest.resultPayload, {
        ...toRecord(syncResult.payload),
        lastSyncStatus: "IN_PROGRESS",
        retryable: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        lastSyncFailure: undefined,
      });

      await prisma.$transaction(async (tx) => {
        await tx.designRequest.update({
          where: { id: activeRequest.id },
          data: {
            status: DesignRequestStatus.IN_PROGRESS,
            errorCode: null,
            errorMessage: null,
            resultPayload: toJsonValue(mergedPayload),
          },
        });

        await tx.statusEvent.create({
          data: {
            contentItemId: contentItem.id,
            fromStatus: ContentStatus.IN_DESIGN,
            toStatus: ContentStatus.IN_DESIGN,
            actorEmail,
            note: "Design sync checked — still in progress.",
          },
        });
      });

      revalidatePath(`/queue/${contentItem.id}`);
      revalidatePath("/queue");
      return;
    }

    if (syncResult.state === "FAILED") {
      const providerError = new Error(syncResult.errorMessage);
      providerError.name = syncResult.errorCode;
      const nextFailureState = appendDesignSyncFailure(activeRequest.resultPayload, {
        attempt: getDesignSyncFailureCount(activeRequest.resultPayload) + 1,
        errorCode: syncResult.errorCode,
        errorMessage: syncResult.errorMessage,
        retryable: syncResult.retryable ?? false,
        recordedAt: new Date().toISOString(),
        stage: "provider_sync",
      });
      const nextFailureCount = getDesignSyncState(nextFailureState).failureCount;

      if (syncResult.retryable ?? false) {
        if (nextFailureCount >= MAX_SYNC_FAILURES) {
          await recordFailure({
            designRequestId: activeRequest.id,
            contentItemId: contentItem.id,
            previousStatus: contentItem.currentStatus,
            sessionEmail: session.email,
            error: providerError,
            stage: "provider_sync",
            retryable: false,
            resultPayload: nextFailureState,
          });
        } else {
          await prisma.$transaction(async (tx) => {
            await tx.designRequest.update({
              where: { id: activeRequest.id },
              data: {
                status: DesignRequestStatus.IN_PROGRESS,
                errorCode: syncResult.errorCode,
                errorMessage: syncResult.errorMessage,
                resultPayload: toJsonValue(nextFailureState),
              },
            });

            await tx.statusEvent.create({
              data: {
                contentItemId: contentItem.id,
                fromStatus: ContentStatus.IN_DESIGN,
                toStatus: ContentStatus.IN_DESIGN,
                actorEmail,
                note: `Design sync attempt ${nextFailureCount} of ${MAX_SYNC_FAILURES} failed transiently. Automatic retry remains available.`,
              },
            });
          });
        }
      } else {
        const terminalFailurePayload = mergeDesignSyncPayload(activeRequest.resultPayload, {
          ...toRecord(nextFailureState),
          lastSyncStatus: "FAILED",
          retryable: false,
          errorCode: syncResult.errorCode,
          errorMessage: syncResult.errorMessage,
        });

        await recordFailure({
          designRequestId: activeRequest.id,
          contentItemId: contentItem.id,
          previousStatus: contentItem.currentStatus,
          sessionEmail: session.email,
          error: providerError,
          stage: "provider_sync",
          retryable: false,
          resultPayload: terminalFailurePayload,
        });
      }

      revalidatePath(`/queue/${contentItem.id}`);
      revalidatePath("/queue");
      return;
    }

    await prisma.$transaction(async (tx) => {
      assertContentStatusTransition({
        currentStatus: contentItem.currentStatus,
        nextStatus: ContentStatus.DESIGN_READY,
        reason: "provider completed the design request successfully",
      });

      const resolvedPayload = mergeDesignSyncPayload(activeRequest.resultPayload, {
        ...toRecord(syncResult.payload),
        lastSyncStatus: "READY",
        retryable: undefined,
        errorCode: undefined,
        errorMessage: undefined,
        lastSyncFailure: undefined,
      });

      await tx.designRequest.update({
        where: { id: activeRequest.id },
        data: {
          status: DesignRequestStatus.READY,
          errorCode: null,
          errorMessage: null,
          resultPayload: toJsonValue(resolvedPayload),
        },
      });

      await tx.contentItem.update({
        where: { id: contentItem.id },
        data: { currentStatus: ContentStatus.DESIGN_READY },
      });

      const assetId = `${activeRequest.id}-static-image`;
      const providerLabel =
        activeRequest.designProvider === DesignProvider.GPT_IMAGE
          ? GPT_IMAGE_PROVIDER_MODE === "REAL"
            ? "REAL_GPT_IMAGE"
            : "MOCK_GPT_IMAGE"
          : activeRequest.designProvider === DesignProvider.AI_VISUAL
            ? NB_PROVIDER_MODE === "REAL"
              ? "REAL_NB"
              : "MOCK_NB"
            : "MOCK";

      await tx.contentAsset.upsert({
        where: { id: assetId },
        update: {
          assetStatus: AssetStatus.READY,
          assetType: AssetType.STATIC_IMAGE,
          locale: contentItem.sourceLocale,
          externalUrl: syncResult.asset.thumbnailUrl,
          metadata: toJsonValue({
            providerMode: providerLabel,
            designId: syncResult.asset.designId,
            editUrl: syncResult.asset.editUrl,
          }),
        },
        create: {
          id: assetId,
          contentItemId: contentItem.id,
          designRequestId: activeRequest.id,
          assetStatus: AssetStatus.READY,
          assetType: AssetType.STATIC_IMAGE,
          locale: contentItem.sourceLocale,
          externalUrl: syncResult.asset.thumbnailUrl,
          metadata: toJsonValue({
            providerMode: providerLabel,
            designId: syncResult.asset.designId,
            editUrl: syncResult.asset.editUrl,
          }),
        },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: contentItem.currentStatus,
          toStatus: ContentStatus.DESIGN_READY,
          actorEmail,
          note: `Design attempt ${activeRequest.attemptNumber} completed. Ready for review.`,
        },
      });
    });
  } catch (error) {
    await recordFailure({
      designRequestId: activeRequest.id,
      contentItemId: contentItem.id,
      previousStatus: contentItem.currentStatus,
      sessionEmail: session.email,
      error,
      stage: "provider_sync",
    });
  }

  revalidatePath(`/queue/${contentItem.id}`);
  revalidatePath("/queue");
}
