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
    normalizeBooleanish(payload.sourceMetadata.publishedFlag) ||
    Boolean(payload.sourceMetadata.publishedPostUrl)
  );
}

function resolveInitialStatus(payload: ContentIngestionPayload) {
  if (isPublishedSourceRow(payload)) {
    return ContentStatus.PUBLISHED_MANUALLY;
  }

  if (payload.workflow.translationRequired ?? payload.content.translationRequired) {
    return ContentStatus.TRANSLATION_PENDING;
  }

  return ContentStatus.IMPORTED;
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

export async function importContentItem(rawPayload: unknown) {
  const payload = contentIngestionPayloadSchema.parse(rawPayload);
  const fingerprint = buildFingerprint(payload);
  const payloadJson = toJsonValue(payload);
  const prisma = getPrisma();
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

  const result = await prisma.$transaction(async (tx) => {
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
          currentStatus: shouldResetWorkflow ? initialStatus : undefined,
          planningSnapshot: payloadJson,
          latestImportAt: new Date(payload.triggeredAt),
        },
      });

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
                : translationRequired
                  ? "Imported from a row that requires translation approval."
                  : "Imported from normalized orchestration contract.",
            },
          },
        },
      });
    }

    const receipt = await tx.importReceipt.create({
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
  });

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
