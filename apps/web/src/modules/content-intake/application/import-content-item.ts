import { createHash } from "node:crypto";
import {
  ContentStatus,
  DesignProvider,
  ImportReceiptStatus,
  Prisma,
  ContentProfile,
  TranslationStatus,
  UpstreamSystem,
} from "@prisma/client";
import { getPrisma } from "@/shared/lib/prisma";
import { logEvent } from "@/shared/logging/logger";
import { generateMockTranslationDraft } from "@/modules/translation/application/generate-translation";
import {
  contentIngestionPayloadSchema,
  type ContentIngestionPayload,
} from "../domain/ingestion-contract";

function buildFingerprint(payload: ContentIngestionPayload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

function toJsonValue(payload: ContentIngestionPayload): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(payload)) as Prisma.InputJsonValue;
}

function buildQualificationError(payload: ContentIngestionPayload) {
  const reasons = payload.normalization.rowQualification.reasons;
  return reasons.length > 0 ? reasons.join(" | ") : "Row was not qualified for import.";
}

function normalizeBooleanish(value: string | boolean | undefined | null) {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value !== "string") {
    return false;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "yes" || normalized === "true" || normalized === "published" || normalized === "done";
}

function isPublishedSourceRow(payload: ContentIngestionPayload) {
  return (
    payload.normalization.rowQualification.isPublishedRow ||
    normalizeBooleanish(payload.sourceMetadata.publishedFlag)
  );
}

function resolveInitialStatus(payload: ContentIngestionPayload) {
  const operationalStatus = payload.workflow.operationalStatus;

  if (operationalStatus === "POSTED" || operationalStatus === "PUBLISHED" || isPublishedSourceRow(payload)) {
    return ContentStatus.POSTED;
  }

  if (operationalStatus === "READY_TO_PUBLISH") {
    return ContentStatus.READY_TO_PUBLISH;
  }

  if (operationalStatus === "READY_FOR_DESIGN" || operationalStatus === "LATE") {
    return ContentStatus.READY_FOR_DESIGN;
  }

  if (operationalStatus === "BLOCKED" || operationalStatus === "WAITING_FOR_COPY") {
    return ContentStatus.BLOCKED;
  }

  if (payload.workflow.translationRequired ?? payload.content.translationRequired) {
    return ContentStatus.TRANSLATION_PENDING;
  }

  return ContentStatus.IMPORTED;
}

function resolveUpdateStatus(
  persistedStatus: ContentStatus,
  initialStatus: ContentStatus,
  shouldResetWorkflow: boolean,
): ContentStatus | undefined {
  if (shouldResetWorkflow) return initialStatus;
  if (
    (persistedStatus === ContentStatus.BLOCKED ||
      persistedStatus === ContentStatus.WAITING_FOR_COPY) &&
    initialStatus === ContentStatus.READY_FOR_DESIGN
  ) {
    return ContentStatus.READY_FOR_DESIGN;
  }
  return undefined;
}

function resolveTranslationCopy(payload: ContentIngestionPayload) {
  if (!((payload.workflow.translationRequired ?? payload.content.translationRequired) === true)) {
    return null;
  }

  return payload.content.translationCopy ?? generateMockTranslationDraft({
    sourceText: payload.content.copy,
    sourceLocale: payload.content.locale,
    targetLocale: "pt-br",
  });
}

export async function importContentItem(
  rawPayload: unknown,
  options: { prisma?: unknown } = {},
) {
  const payload = contentIngestionPayloadSchema.parse(rawPayload);
  const fingerprint = buildFingerprint(payload);
  const payloadJson = toJsonValue(payload);
  const prisma = options.prisma ? (options.prisma as Prisma.TransactionClient) : getPrisma();
  logEvent("info", "[TRACE_IMPORT_QUEUE][INGEST] start", {
    idempotencyKey: payload.idempotencyKey,
    mode: payload.mode,
    spreadsheetId: payload.source.spreadsheetId,
    worksheetId: payload.source.worksheetId,
    rowId: payload.source.rowId,
    rowVersion: payload.source.rowVersion,
    title: payload.content.title,
    reimportStrategy: payload.workflow.reimportStrategy,
    equivalenceTargetContentItemId: payload.workflow.equivalenceTargetContentItemId ?? null,
    disposition: payload.normalization.rowQualification.disposition,
  });

  const existingReceipt = await prisma.importReceipt.findUnique({
    where: {
      idempotencyKey_mode: {
        idempotencyKey: payload.idempotencyKey,
        mode: payload.mode,
      },
    },
  });

  const existingSourceLink = await prisma.contentSourceLink.findUnique({
    where: {
      upstreamSystem_spreadsheetId_worksheetId_rowId: {
        upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
        spreadsheetId: payload.source.spreadsheetId,
        worksheetId: payload.source.worksheetId,
        rowId: payload.source.rowId,
      },
    },
  });
  logEvent("info", "[TRACE_IMPORT_QUEUE][INGEST] preflight", {
    idempotencyKey: payload.idempotencyKey,
    existingReceiptId: existingReceipt?.id ?? null,
    existingReceiptContentItemId: existingReceipt?.contentItemId ?? null,
    existingSourceLinkContentItemId: existingSourceLink?.contentItemId ?? null,
  });

  if (payload.mode === "PREVIEW") {
    if (!existingReceipt) {
      const previewStatus =
        payload.normalization.rowQualification.disposition === "QUALIFIED"
          ? ImportReceiptStatus.PROCESSED
          : ImportReceiptStatus.REJECTED;

      const previewReceipt = await prisma.importReceipt.create({
        data: {
          idempotencyKey: payload.idempotencyKey,
          mode: payload.mode,
          orchestrator: payload.orchestrator,
          upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
          sheetProfileKey: payload.normalization.sheetProfileKey,
          sheetProfileVersion: payload.normalization.sheetProfileVersion,
          status: previewStatus,
          payloadVersion: payload.version,
          fingerprint,
          payload: payloadJson,
          errorCode:
            previewStatus === ImportReceiptStatus.REJECTED
              ? payload.normalization.rowQualification.disposition
              : null,
          errorMessage:
            previewStatus === ImportReceiptStatus.REJECTED
              ? buildQualificationError(payload)
              : null,
          processedAt: new Date(),
        },
      });

      return {
        mode: payload.mode,
        duplicate: false,
        receiptId: previewReceipt.id,
        sheetProfileKey: payload.normalization.sheetProfileKey,
        disposition: payload.normalization.rowQualification.disposition,
        reasons: payload.normalization.rowQualification.reasons,
        wouldCreate: !existingSourceLink,
        wouldUpdate: Boolean(existingSourceLink),
        existingContentItemId: existingSourceLink?.contentItemId ?? null,
        titleDerivation: payload.normalization.titleDerivation,
        metadataPolicy:
          "publishedFlag and publishedPostUrl stay as source metadata only and cannot override app-owned workflow state.",
      };
    }

    return {
      mode: payload.mode,
      duplicate: true,
      receiptId: existingReceipt.id,
      sheetProfileKey: payload.normalization.sheetProfileKey,
      disposition: payload.normalization.rowQualification.disposition,
      reasons: payload.normalization.rowQualification.reasons,
      wouldCreate: !existingSourceLink,
      wouldUpdate: Boolean(existingSourceLink),
      existingContentItemId: existingSourceLink?.contentItemId ?? null,
      titleDerivation: payload.normalization.titleDerivation,
      metadataPolicy:
        "publishedFlag and publishedPostUrl stay as source metadata only and cannot override app-owned workflow state.",
    };
  }

  if (existingReceipt) {
    // Only treat as a valid duplicate if the receipt links to a live canonical record.
    // A receipt with contentItemId === null or pointing to a deleted contentItem is orphaned
    // (e.g. after queue/clear) and must not block canonical creation.
    const linkedRecordExists =
      existingReceipt.contentItemId !== null &&
      (await prisma.contentItem.count({
        where: { id: existingReceipt.contentItemId, deletedAt: null },
      })) > 0;

    if (linkedRecordExists) {
      logEvent("info", "[TRACE_IMPORT_QUEUE][INGEST] duplicate-receipt", {
        idempotencyKey: payload.idempotencyKey,
        receiptId: existingReceipt.id,
        contentItemId: existingReceipt.contentItemId,
        status: existingReceipt.status,
      });
      return {
        mode: payload.mode,
        duplicate: true,
        receiptId: existingReceipt.id,
        contentItemId: existingReceipt.contentItemId,
        status: existingReceipt.status,
      };
    }

    logEvent("info", "[TRACE_IMPORT_QUEUE][INGEST] orphaned-receipt", {
      idempotencyKey: payload.idempotencyKey,
      receiptId: existingReceipt.id,
      contentItemId: existingReceipt.contentItemId,
      status: existingReceipt.status,
      reason: existingReceipt.contentItemId === null ? "null contentItemId" : "linked record not found",
    });
    // Fall through to canonical creation. The orphaned receipt will be repaired in the transaction.
  }

  if (payload.normalization.rowQualification.disposition !== "QUALIFIED") {
    const rejectedReceipt = await prisma.importReceipt.create({
      data: {
        idempotencyKey: payload.idempotencyKey,
        mode: payload.mode,
        orchestrator: payload.orchestrator,
        upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
        sheetProfileKey: payload.normalization.sheetProfileKey,
        sheetProfileVersion: payload.normalization.sheetProfileVersion,
        status: ImportReceiptStatus.REJECTED,
        payloadVersion: payload.version,
        fingerprint,
        payload: payloadJson,
        errorCode: payload.normalization.rowQualification.disposition,
        errorMessage: buildQualificationError(payload),
        processedAt: new Date(),
      },
    });

    return {
      mode: payload.mode,
      duplicate: false,
      receiptId: rejectedReceipt.id,
      status: rejectedReceipt.status,
      disposition: payload.normalization.rowQualification.disposition,
      reasons: payload.normalization.rowQualification.reasons,
    };
  }

  const runImportTransaction = async (tx: Prisma.TransactionClient) => {
    const sourceLink = await tx.contentSourceLink.findUnique({
      where: {
        upstreamSystem_spreadsheetId_worksheetId_rowId: {
          upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
          spreadsheetId: payload.source.spreadsheetId,
          worksheetId: payload.source.worksheetId,
          rowId: payload.source.rowId,
        },
      },
    });

    const title = payload.normalization.titleDerivation.title || payload.content.title;
    const translationCopy = resolveTranslationCopy(payload);
    const initialStatus = resolveInitialStatus(payload);
    const translationRequired = payload.workflow.translationRequired ?? payload.content.translationRequired;
    const shouldResetWorkflow = payload.workflow.reimportStrategy === "REPLACE";
    const targetContentItemId =
      sourceLink?.contentItemId ??
      (payload.workflow.reimportStrategy !== "KEEP_AS_IS"
        ? payload.workflow.equivalenceTargetContentItemId ?? null
        : null);
    const operation =
      targetContentItemId !== null
        ? sourceLink?.contentItemId
          ? "update-existing-source-link"
          : "update-equivalence-target"
        : "create-new-content-item";
    const translationStatus = isPublishedSourceRow(payload)
      ? translationRequired
        ? TranslationStatus.APPROVED
        : TranslationStatus.NOT_REQUIRED
      : translationRequired
        ? TranslationStatus.READY_FOR_APPROVAL
        : TranslationStatus.NOT_REQUIRED;

    let contentItem;

    if (targetContentItemId) {
      const persistedItem = await tx.contentItem.findUnique({
        where: { id: targetContentItemId },
        select: { currentStatus: true },
      });
      const persistedStatus = persistedItem?.currentStatus ?? ContentStatus.IMPORTED;
      const resolvedUpdateStatus = resolveUpdateStatus(persistedStatus, initialStatus, shouldResetWorkflow);

      contentItem = await tx.contentItem.update({
        where: { id: targetContentItemId },
        data: {
          canonicalKey: payload.content.canonicalKey,
          profile: payload.content.profile as ContentProfile,
          contentType: payload.content.contentType,
          title,
          copy: payload.content.copy,
          sourceLocale: payload.content.locale,
          translationRequired,
          translationStatus,
          translationCopy: translationCopy ?? undefined,
          translationRequestedAt: translationRequired ? new Date(payload.triggeredAt) : undefined,
          translationGeneratedAt: translationCopy ? new Date(payload.triggeredAt) : undefined,
          preferredDesignProvider: payload.workflow.preferredDesignProvider as DesignProvider,
          autopostEnabled: payload.workflow.autoPostEnabled,
          currentStatus: resolvedUpdateStatus,
          deletedAt: null,
          planningSnapshot: payloadJson,
          latestImportAt: new Date(payload.triggeredAt),
        },
      });

      if (resolvedUpdateStatus !== undefined && resolvedUpdateStatus !== persistedStatus) {
        await tx.statusEvent.create({
          data: {
            contentItemId: contentItem.id,
            fromStatus: persistedStatus,
            toStatus: resolvedUpdateStatus,
            note: `Status advanced from ${persistedStatus} to ${resolvedUpdateStatus} on reimport: source content now qualifies for design.`,
          },
        });
      }

      if (sourceLink) {
        await tx.contentSourceLink.updateMany({
          where: {
            upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
            spreadsheetId: payload.source.spreadsheetId,
            worksheetId: payload.source.worksheetId,
            rowId: payload.source.rowId,
          },
          data: {
            sheetProfileKey: payload.normalization.sheetProfileKey,
            sheetProfileVersion: payload.normalization.sheetProfileVersion,
            worksheetName: payload.source.worksheetName,
            rowNumber: payload.source.rowNumber,
            rowVersion: payload.source.rowVersion,
            lastFingerprint: fingerprint,
          },
        });
      } else {
        await tx.contentSourceLink.create({
          data: {
            contentItemId: contentItem.id,
            upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
            sheetProfileKey: payload.normalization.sheetProfileKey,
            sheetProfileVersion: payload.normalization.sheetProfileVersion,
            spreadsheetId: payload.source.spreadsheetId,
            worksheetId: payload.source.worksheetId,
            worksheetName: payload.source.worksheetName,
            rowId: payload.source.rowId,
            rowNumber: payload.source.rowNumber,
            rowVersion: payload.source.rowVersion,
            lastFingerprint: fingerprint,
          },
        });
      }
    } else {
      contentItem = await tx.contentItem.create({
        data: {
          canonicalKey: payload.content.canonicalKey,
          profile: payload.content.profile as ContentProfile,
          contentType: payload.content.contentType,
          title,
          copy: payload.content.copy,
          sourceLocale: payload.content.locale,
          translationRequired,
          translationStatus,
          translationCopy: translationCopy ?? undefined,
          translationRequestedAt: translationRequired ? new Date(payload.triggeredAt) : undefined,
          translationGeneratedAt: translationCopy ? new Date(payload.triggeredAt) : undefined,
          preferredDesignProvider: payload.workflow.preferredDesignProvider as DesignProvider,
          autopostEnabled: payload.workflow.autoPostEnabled,
          currentStatus: initialStatus,
          planningSnapshot: payloadJson,
          latestImportAt: new Date(payload.triggeredAt),
          sourceLinks: {
            create: {
              upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
              sheetProfileKey: payload.normalization.sheetProfileKey,
              sheetProfileVersion: payload.normalization.sheetProfileVersion,
              spreadsheetId: payload.source.spreadsheetId,
              worksheetId: payload.source.worksheetId,
              worksheetName: payload.source.worksheetName,
              rowId: payload.source.rowId,
              rowNumber: payload.source.rowNumber,
              rowVersion: payload.source.rowVersion,
              lastFingerprint: fingerprint,
            },
          },
          statusEvents: {
            create: {
              toStatus: initialStatus,
              note: isPublishedSourceRow(payload)
                ? "Imported from a published source row."
                : initialStatus === ContentStatus.BLOCKED
                  ? `Imported as blocked: ${payload.workflow.blockReason ?? "missing required content"}.`
                  : translationRequired
                  ? "Imported from a row that requires translation approval."
                  : "Imported from normalized orchestration contract.",
            },
          },
        },
      });
    }

    // If we fell through an orphaned receipt, repair it in-place to avoid a unique constraint
    // violation on (idempotencyKey, mode). Otherwise create a fresh receipt.
    const receipt = existingReceipt
      ? await tx.importReceipt.update({
          where: { id: existingReceipt.id },
          data: {
            status: ImportReceiptStatus.PROCESSED,
            fingerprint,
            payload: payloadJson,
            contentItemId: contentItem.id,
            processedAt: new Date(),
          },
        })
      : await tx.importReceipt.create({
          data: {
            idempotencyKey: payload.idempotencyKey,
            mode: payload.mode,
            orchestrator: payload.orchestrator,
            upstreamSystem: UpstreamSystem.GOOGLE_SHEETS,
            sheetProfileKey: payload.normalization.sheetProfileKey,
            sheetProfileVersion: payload.normalization.sheetProfileVersion,
            status: ImportReceiptStatus.PROCESSED,
            payloadVersion: payload.version,
            fingerprint,
            payload: payloadJson,
            contentItemId: contentItem.id,
            processedAt: new Date(),
          },
        });

    return {
      mode: payload.mode,
      duplicate: false,
      receiptId: receipt.id,
      contentItemId: contentItem.id,
      status: receipt.status,
      operation,
      targetContentItemId,
    };
  };

  const result = options.prisma
    ? await runImportTransaction(options.prisma as Prisma.TransactionClient)
    : await getPrisma().$transaction(runImportTransaction);

  logEvent("info", "[TRACE_IMPORT_QUEUE][INGEST] committed", {
    idempotencyKey: payload.idempotencyKey,
    contentItemId: result.contentItemId,
    operation: "operation" in result ? result.operation : null,
    targetContentItemId: "targetContentItemId" in result ? result.targetContentItemId : null,
    orchestrator: payload.orchestrator,
    sheetProfileKey: payload.normalization.sheetProfileKey,
    workflow: payload.workflow,
  });

  return result;
}
