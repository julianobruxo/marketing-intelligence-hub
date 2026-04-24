"use server";

import {
  AssetStatus,
  AssetType,
  ContentStatus,
  DesignProvider,
  DesignRequestStatus,
  Prisma,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { requireSession } from "@/modules/auth/application/auth-service";
import { CANVA_PROVIDER_MODE } from "@/shared/config/env";
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import {
  DEFAULT_DESIGN_SIMULATION_SCENARIO,
  parseDesignSimulationScenario,
} from "../domain/design-provider";
import { CANVA_SLICE_V1, isSliceOneCanvaEligible } from "../domain/canva-slice";
import { getCanvaDesignExecutionProvider } from "../infrastructure/design-provider-registry";
import { buildDesignInputContract } from "../domain/design-input-contract";
import { canTriggerDesignFromStatus } from "../domain/design-readiness-gate";
import { DESIGN_MAX_AUTO_RETRIES } from "../domain/design-workflow-contract";
import {
  buildDesignRequestFingerprint,
  buildDesignSourceIdentity,
} from "../domain/design-request-fingerprint";

function buildRequestFingerprint(input: {
  sourceIdentity: string;
  templateId: string;
  fieldMappings: Record<string, string>;
}) {
  return buildDesignRequestFingerprint({
    provider: DesignProvider.CANVA,
    sourceIdentity: input.sourceIdentity,
    templateId: input.templateId,
    fieldMappings: input.fieldMappings,
  });
}

function hasOperatorSelectedDesignVariation(...values: unknown[]) {
  return values.some((value) => {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      return false;
    }

    const record = value as Record<string, unknown>;
    if (typeof record.selectedVariationId === "string" && record.selectedVariationId.trim().length > 0) {
      return true;
    }

    const selectedVariation = record.selectedVariation;
    if (!selectedVariation || typeof selectedVariation !== "object" || Array.isArray(selectedVariation)) {
      return false;
    }

    const selectedVariationRecord = selectedVariation as Record<string, unknown>;
    return typeof selectedVariationRecord.id === "string" && selectedVariationRecord.id.trim().length > 0;
  });
}

function toJsonValue(payload: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function buildFailurePayload(error: unknown, stage: string, context?: Record<string, unknown>) {
  const message = error instanceof Error ? error.message : "Unknown design-provider failure.";
  const code =
    error instanceof Error && error.name && error.name !== "Error"
      ? error.name
      : "DESIGN_PROVIDER_REQUEST_FAILED";

  return {
    stage,
    error: {
      code,
      message,
    },
    context,
  };
}

async function failDesignRequest(input: {
  designRequestId: string;
  contentItemId: string;
  previousStatus: ContentStatus;
  sessionEmail: string;
  error: unknown;
  stage: string;
  context?: Record<string, unknown>;
}) {
  const prisma = getPrisma();
  const failurePayload = buildFailurePayload(input.error, input.stage, input.context);

  assertContentStatusTransition({
    currentStatus: input.previousStatus,
    nextStatus: ContentStatus.DESIGN_FAILED,
    reason: `design ${input.stage} failure`,
  });

  await prisma.$transaction(async (tx) => {
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
      data: {
        currentStatus: ContentStatus.DESIGN_FAILED,
      },
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
  });
}

/**
 * @deprecated Replaced by canTriggerDesignFromStatus from design-readiness-gate.
 * Left here as a named shim so readers can see the migration path.
 */
function canTriggerCanvaFromStatus(status: ContentStatus) {
  return canTriggerDesignFromStatus(status);
}

function buildAttemptContext(input: {
  templateId: string;
  requestFingerprint: string;
  attemptNumber: number;
  scenario: string;
  payload?: unknown;
}) {
  return {
    templateId: input.templateId,
    requestFingerprint: input.requestFingerprint,
    attemptNumber: input.attemptNumber,
    simulationScenario: input.scenario,
    providerPayload: input.payload,
  };
}

export async function runCanvaDesignRequestAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const provider = getCanvaDesignExecutionProvider();
  const contentItemId = String(formData.get("contentItemId") ?? "");
  const retryRequested = String(formData.get("retry") ?? "false") === "true";
  const scenario = parseDesignSimulationScenario(formData.get("designScenario"));

  if (!contentItemId) {
    return;
  }

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

  if (!contentItem) {
    return;
  }

  if (
    !isSliceOneCanvaEligible({
      profile: contentItem.profile,
      contentType: contentItem.contentType,
      sourceLocale: contentItem.sourceLocale,
    })
  ) {
    return;
  }

  if (!canTriggerCanvaFromStatus(contentItem.currentStatus)) {
    return;
  }

  const profileMapping = await prisma.profileTemplateMapping.findFirst({
    where: {
      profile: CANVA_SLICE_V1.profile,
      contentType: CANVA_SLICE_V1.contentType,
      locale: CANVA_SLICE_V1.locale,
      designProvider: DesignProvider.CANVA,
      isActive: true,
    },
  });

  if (!profileMapping) {
    return;
  }

  const sourceLink = contentItem.sourceLinks[0] ?? null;
  const sourceIdentity = buildDesignSourceIdentity({
    canonicalKey: contentItem.canonicalKey,
    spreadsheetId: sourceLink?.spreadsheetId,
    worksheetId: sourceLink?.worksheetId,
    rowId: sourceLink?.rowId,
  });
  const fieldMappings = {
    [CANVA_SLICE_V1.datasetFields.title]: contentItem.title,
    [CANVA_SLICE_V1.datasetFields.body]: contentItem.copy,
  };
  const requestFingerprint = buildRequestFingerprint({
    sourceIdentity,
    templateId: profileMapping.externalTemplateId,
    fieldMappings,
  });

  const matchingRequests = contentItem.designRequests.filter(
    (request) => request.requestFingerprint === requestFingerprint,
  );
  const activeRequest = matchingRequests.find(
    (request) =>
      request.status === DesignRequestStatus.REQUESTED ||
      request.status === DesignRequestStatus.IN_PROGRESS,
  );

  if (activeRequest) {
    return;
  }

  const completedRequest = matchingRequests.find(
    (request) =>
      request.status === DesignRequestStatus.READY ||
      request.status === DesignRequestStatus.APPROVED ||
      request.status === DesignRequestStatus.COMPLETED,
  );

  if (completedRequest && !retryRequested) {
    return;
  }

  const latestAttempt = matchingRequests[0]?.attemptNumber ?? 0;
  const nextAttemptNumber =
    retryRequested || contentItem.currentStatus === ContentStatus.DESIGN_FAILED
      ? latestAttempt + 1
      : latestAttempt === 0
        ? 1
        : latestAttempt;

  // Retry limit enforcement — DESIGN_MAX_AUTO_RETRIES is the maximum number of
  // total attempts allowed per unique content fingerprint.  The view model
  // surfaces RETRY_EXHAUSTED to the operator before they reach this point.
  if (nextAttemptNumber > DESIGN_MAX_AUTO_RETRIES) {
    return;
  }

  const designContract = buildDesignInputContract({
    contentItem,
    templateId: profileMapping.externalTemplateId,
    attemptNumber: nextAttemptNumber,
  });

  let designRequest:
    | {
        id: string;
        attemptNumber: number;
      }
    | undefined;

  try {
    const includeMockExecution = CANVA_PROVIDER_MODE !== "REAL";
    assertContentStatusTransition({
      currentStatus: contentItem.currentStatus,
      nextStatus: ContentStatus.IN_DESIGN,
      reason: "creating a design request",
    });

    designRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.designRequest.create({
        data: {
          contentItemId: contentItem.id,
          profileMappingId: profileMapping.id,
          designProvider: DesignProvider.CANVA,
          requestFingerprint,
          attemptNumber: nextAttemptNumber,
          status: DesignRequestStatus.REQUESTED,
          requestPayload: {
            slice: "canva-v1",
            templateFamily: CANVA_SLICE_V1.templateFamily,
            templateId: profileMapping.externalTemplateId,
            contentItemId: contentItem.id,
            attemptNumber: nextAttemptNumber,
            sentBy: session.email,
            fieldMappings,
            data: fieldMappings,
            ...(includeMockExecution
              ? {
                  execution: {
                    mode: "MOCK",
                    simulationScenario: scenario,
                  },
                }
              : {}),
          },
        },
        select: {
          id: true,
          attemptNumber: true,
        },
      });

      await tx.contentItem.update({
        where: { id: contentItem.id },
        data: {
          currentStatus: ContentStatus.IN_DESIGN,
        },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: contentItem.currentStatus,
          toStatus: ContentStatus.IN_DESIGN,
          actorEmail: session.email,
          note: `Design attempt ${nextAttemptNumber} submitted for ${CANVA_SLICE_V1.templateFamily}.`,
        },
      });

      return created;
    });
  } catch (error) {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === "P2002"
    ) {
      return;
    }

    throw error;
  }

  try {
    const submitted = await provider.submitRequest({
      ...designContract,
      scenario,
      requestPayload: {
        slice: "canva-v1",
        templateFamily: CANVA_SLICE_V1.templateFamily,
        templateId: profileMapping.externalTemplateId,
        contentItemId: contentItem.id,
        attemptNumber: nextAttemptNumber,
        sentBy: session.email,
        fieldMappings,
        data: fieldMappings,
        ...(CANVA_PROVIDER_MODE !== "REAL"
          ? {
              execution: {
                mode: "MOCK",
                simulationScenario: scenario,
              },
            }
          : {}),
      },
    });

    // Item is already IN_DESIGN from the creation tx above.
    // Only the DesignRequest internal status transitions here (REQUESTED → IN_PROGRESS).
    await prisma.designRequest.update({
      where: { id: designRequest.id },
      data: {
        externalRequestId: submitted.externalRequestId,
        status: DesignRequestStatus.IN_PROGRESS,
        resultPayload: toJsonValue(submitted.payload),
      },
    });
  } catch (error) {
    await failDesignRequest({
      designRequestId: designRequest.id,
      contentItemId: contentItem.id,
      previousStatus: ContentStatus.IN_DESIGN,
      sessionEmail: session.email,
      error,
      stage: "provider_submit",
      context: buildAttemptContext({
        templateId: profileMapping.externalTemplateId,
        requestFingerprint,
        attemptNumber: designRequest.attemptNumber,
        scenario,
      }),
    });
  }

  revalidatePath(`/queue/${contentItem.id}`);
  revalidatePath("/queue");
}

export async function syncCanvaDesignRequestAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const provider = getCanvaDesignExecutionProvider();
  const contentItemId = String(formData.get("contentItemId") ?? "");

  if (!contentItemId) {
    return;
  }

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
      },
    },
  });

  if (!contentItem) {
    return;
  }

  const activeRequest = contentItem.designRequests.find(
    (request) =>
      request.status === DesignRequestStatus.REQUESTED ||
      request.status === DesignRequestStatus.IN_PROGRESS,
  );

  if (!activeRequest || !activeRequest.externalRequestId) {
    return;
  }

  const requestPayload =
    activeRequest.requestPayload && typeof activeRequest.requestPayload === "object"
      ? (activeRequest.requestPayload as Record<string, unknown>)
      : null;
  const execution =
    requestPayload?.execution && typeof requestPayload.execution === "object"
      ? (requestPayload.execution as Record<string, unknown>)
      : null;
  const scenario =
    typeof execution?.simulationScenario === "string"
      ? execution.simulationScenario
      : DEFAULT_DESIGN_SIMULATION_SCENARIO;
  const templateId =
    typeof requestPayload?.templateId === "string" ? requestPayload.templateId : "unknown-template";

  try {
    const syncResult = await provider.syncRequest({
      externalRequestId: activeRequest.externalRequestId,
      requestPayload: activeRequest.requestPayload,
      resultPayload: activeRequest.resultPayload,
    });

    if (syncResult.state === "IN_PROGRESS") {
      // No ContentItem transition — item stays IN_DESIGN (or DESIGN_IN_PROGRESS for legacy records).
      // Only the DesignRequest internal status is updated here.
      await prisma.designRequest.update({
        where: { id: activeRequest.id },
        data: {
          status: DesignRequestStatus.IN_PROGRESS,
          resultPayload: toJsonValue(syncResult.payload),
        },
      });

      revalidatePath(`/queue/${contentItem.id}`);
      revalidatePath("/queue");
      return;
    }

    if (syncResult.state === "FAILED") {
      const providerError = new Error(syncResult.errorMessage);
      providerError.name = syncResult.errorCode;

      await failDesignRequest({
        designRequestId: activeRequest.id,
        contentItemId: contentItem.id,
        previousStatus: contentItem.currentStatus,
        sessionEmail: session.email,
        error: providerError,
        stage: "provider_sync",
        context: buildAttemptContext({
          templateId,
          requestFingerprint: activeRequest.requestFingerprint,
          attemptNumber: activeRequest.attemptNumber,
          scenario,
          payload: syncResult.payload,
        }),
      });

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

      await tx.designRequest.update({
        where: { id: activeRequest.id },
        data: {
          status: DesignRequestStatus.READY,
          errorCode: null,
          errorMessage: null,
          resultPayload: toJsonValue(syncResult.payload),
        },
      });

      await tx.contentItem.update({
        where: { id: contentItem.id },
        data: {
          currentStatus: ContentStatus.DESIGN_READY,
        },
      });

      await tx.contentAsset.upsert({
        where: {
          id: `${activeRequest.id}-static-image`,
        },
        update: {
          assetStatus: AssetStatus.READY,
          assetType: AssetType.STATIC_IMAGE,
          locale: contentItem.sourceLocale,
          externalUrl: syncResult.asset.thumbnailUrl,
          metadata: toJsonValue({
            providerMode: "MOCK",
            designId: syncResult.asset.designId,
            editUrl: syncResult.asset.editUrl,
          }),
        },
        create: {
          id: `${activeRequest.id}-static-image`,
          contentItemId: contentItem.id,
          designRequestId: activeRequest.id,
          assetStatus: AssetStatus.READY,
          assetType: AssetType.STATIC_IMAGE,
          locale: contentItem.sourceLocale,
          externalUrl: syncResult.asset.thumbnailUrl,
          metadata: toJsonValue({
            providerMode: "MOCK",
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
          actorEmail: session.email,
          note: `Design attempt ${activeRequest.attemptNumber} resolved successfully and is ready for review.`,
        },
      });
    });
  } catch (error) {
    await failDesignRequest({
      designRequestId: activeRequest.id,
      contentItemId: contentItem.id,
      previousStatus: contentItem.currentStatus,
      sessionEmail: session.email,
      error,
      stage: "provider_sync",
      context: buildAttemptContext({
        templateId,
        requestFingerprint: activeRequest.requestFingerprint,
        attemptNumber: activeRequest.attemptNumber,
        scenario,
      }),
    });
  }

  revalidatePath(`/queue/${contentItem.id}`);
  revalidatePath("/queue");
}

export async function approveDesignReadyAction(formData: FormData) {
  const session = await requireSession();
  const prisma = getPrisma();
  const contentItemId = String(formData.get("contentItemId") ?? "");

  if (!contentItemId) {
    return;
  }

  const contentItem = await prisma.contentItem.findFirst({
    where: { id: contentItemId, deletedAt: null },
    include: {
      designRequests: {
        where: { deletedAt: null },
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
      assets: {
        where: { deletedAt: null },
        orderBy: [{ slideIndex: "asc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });

  if (!contentItem || contentItem.currentStatus !== ContentStatus.DESIGN_READY) {
    return;
  }

  const latestDesignRequest = contentItem.designRequests[0];
  const latestAsset = contentItem.assets[0];
  const requiresVariationSelection =
    latestDesignRequest?.designProvider === DesignProvider.GPT_IMAGE ||
    latestDesignRequest?.designProvider === DesignProvider.AI_VISUAL;

  if (
    requiresVariationSelection &&
    !hasOperatorSelectedDesignVariation(latestAsset?.metadata, latestDesignRequest?.resultPayload)
  ) {
    return;
  }

  assertContentStatusTransition({
    currentStatus: ContentStatus.DESIGN_READY,
    nextStatus: ContentStatus.DESIGN_APPROVED,
    reason: "design approval recorded",
  });

  await prisma.$transaction(async (tx) => {
    await tx.contentItem.update({
      where: { id: contentItemId },
      data: {
        currentStatus: ContentStatus.DESIGN_APPROVED,
      },
    });

    if (latestDesignRequest) {
      await tx.designRequest.update({
        where: { id: latestDesignRequest.id },
        data: {
          status: DesignRequestStatus.APPROVED,
        },
      });
    }

    await tx.statusEvent.create({
      data: {
        contentItemId,
        fromStatus: ContentStatus.DESIGN_READY,
        toStatus: ContentStatus.DESIGN_APPROVED,
        actorEmail: session.email,
        note: "Design approved for downstream publishing preparation.",
      },
    });
  });

  revalidatePath(`/queue/${contentItemId}`);
  revalidatePath("/queue");
}
