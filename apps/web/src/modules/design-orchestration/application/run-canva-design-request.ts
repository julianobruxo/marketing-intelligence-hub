"use server";

import { createHash } from "node:crypto";
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
import { getPrisma } from "@/shared/lib/prisma";
import { assertContentStatusTransition } from "@/modules/workflow/domain/phase-one-workflow";
import {
  DEFAULT_DESIGN_SIMULATION_SCENARIO,
  parseDesignSimulationScenario,
} from "../domain/design-provider";
import { CANVA_SLICE_V1, isSliceOneCanvaEligible } from "../domain/canva-slice";
import { getCanvaDesignExecutionProvider } from "../infrastructure/design-provider-registry";

function buildRequestFingerprint(input: {
  contentItemId: string;
  templateId: string;
  title: string;
  copy: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify(input))
    .digest("hex");
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

function canTriggerCanvaFromStatus(status: ContentStatus) {
  return status === ContentStatus.CONTENT_APPROVED || status === ContentStatus.DESIGN_FAILED;
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

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      designRequests: {
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

  const requestFingerprint = buildRequestFingerprint({
    contentItemId: contentItem.id,
    templateId: profileMapping.externalTemplateId,
    title: contentItem.title,
    copy: contentItem.copy,
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

  let designRequest:
    | {
        id: string;
        attemptNumber: number;
      }
    | undefined;

  try {
    assertContentStatusTransition({
      currentStatus: contentItem.currentStatus,
      nextStatus: ContentStatus.DESIGN_REQUESTED,
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
            execution: {
              mode: "FAKE_CANVA",
              simulationScenario: scenario,
            },
            templateFamily: CANVA_SLICE_V1.templateFamily,
            templateId: profileMapping.externalTemplateId,
            contentItemId: contentItem.id,
            attemptNumber: nextAttemptNumber,
            sentBy: session.email,
            data: {
              [CANVA_SLICE_V1.datasetFields.title]: contentItem.title,
              [CANVA_SLICE_V1.datasetFields.body]: contentItem.copy,
            },
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
          currentStatus: ContentStatus.DESIGN_REQUESTED,
        },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: contentItem.currentStatus,
          toStatus: ContentStatus.DESIGN_REQUESTED,
          actorEmail: session.email,
          note: `Design attempt ${nextAttemptNumber} created for ${CANVA_SLICE_V1.templateFamily}.`,
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
      contentItemId: contentItem.id,
      title: contentItem.title,
      copy: contentItem.copy,
      templateId: profileMapping.externalTemplateId,
      attemptNumber: nextAttemptNumber,
      scenario,
    });

    await prisma.$transaction(async (tx) => {
      assertContentStatusTransition({
        currentStatus: ContentStatus.DESIGN_REQUESTED,
        nextStatus: ContentStatus.DESIGN_IN_PROGRESS,
        reason: "provider accepted the design request",
      });

      await tx.designRequest.update({
        where: { id: designRequest.id },
        data: {
          externalRequestId: submitted.externalRequestId,
          status: DesignRequestStatus.IN_PROGRESS,
          resultPayload: toJsonValue(submitted.payload),
        },
      });

      await tx.contentItem.update({
        where: { id: contentItem.id },
        data: {
          currentStatus: ContentStatus.DESIGN_IN_PROGRESS,
        },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: ContentStatus.DESIGN_REQUESTED,
          toStatus: ContentStatus.DESIGN_IN_PROGRESS,
          actorEmail: session.email,
          note: `Fake Canva accepted design attempt ${nextAttemptNumber}. Refresh the request to resolve success, delay, or failure.`,
        },
      });
    });
  } catch (error) {
    await failDesignRequest({
      designRequestId: designRequest.id,
      contentItemId: contentItem.id,
      previousStatus: ContentStatus.DESIGN_REQUESTED,
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

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      designRequests: {
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
      assertContentStatusTransition({
        currentStatus: ContentStatus.DESIGN_IN_PROGRESS,
        nextStatus: ContentStatus.DESIGN_IN_PROGRESS,
        reason: "provider returned an in-progress sync payload",
      });

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
        previousStatus: ContentStatus.DESIGN_IN_PROGRESS,
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
        currentStatus: ContentStatus.DESIGN_IN_PROGRESS,
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
            providerMode: "FAKE_CANVA",
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
            providerMode: "FAKE_CANVA",
            designId: syncResult.asset.designId,
            editUrl: syncResult.asset.editUrl,
          }),
        },
      });

      await tx.statusEvent.create({
        data: {
          contentItemId: contentItem.id,
          fromStatus: ContentStatus.DESIGN_IN_PROGRESS,
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
      previousStatus: ContentStatus.DESIGN_IN_PROGRESS,
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

  const contentItem = await prisma.contentItem.findUnique({
    where: { id: contentItemId },
    include: {
      designRequests: {
        orderBy: [{ attemptNumber: "desc" }, { createdAt: "desc" }],
        take: 1,
      },
    },
  });

  if (!contentItem || contentItem.currentStatus !== ContentStatus.DESIGN_READY) {
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

    if (contentItem.designRequests[0]) {
      await tx.designRequest.update({
        where: { id: contentItem.designRequests[0].id },
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
