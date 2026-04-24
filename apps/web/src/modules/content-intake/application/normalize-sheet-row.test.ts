import { describe, expect, it } from "vitest";

import { normalizeSheetRow } from "./normalize-sheet-row";

function buildNormalizeRequest(rowValues: string[]) {
  return {
    version: 1 as const,
    mode: "PREVIEW" as const,
    orchestrator: "MANUAL" as const,
    sheetProfileKey: "yann-smm-plan",
    source: {
      spreadsheetId: "1jjYpO7XxCBY2Jfe7hnqanS2H2EJDbbzs-P_BmkefLM4",
      spreadsheetName: "SMM Plan | Yann Kronberg",
      worksheetId: "worksheet-apr-2026",
      worksheetName: "LinkedIn + Substack (April 2026)",
      rowId: "row-2",
      rowNumber: 2,
      headerRowNumber: 1,
      headers: [
        "Date",
        "Platform",
        "Copywriter Brief",
        "Title",
        "LinkedIn Copy",
      ],
      rowValues,
    },
    worksheetSelection: {
      targetMonth: "2026-04",
      availableWorksheets: [
        {
          worksheetId: "worksheet-apr-2026",
          worksheetName: "LinkedIn + Substack (April 2026)",
        },
      ],
    },
    contentHints: {
      profile: "YANN" as const,
      contentType: "STATIC_POST" as const,
      locale: "en",
      translationRequired: false,
    },
    workflow: {
      translationRequired: false,
      autoPostEnabled: false,
      preferredDesignProvider: "CANVA" as const,
      reimportStrategy: "UPDATE" as const,
      conflictConfidence: "NO_MEANINGFUL_MATCH" as const,
    },
  };
}

describe("normalizeSheetRow", () => {
  it("routes rows with operational title plus scheduling signal to BLOCKED when LinkedIn copy is missing", () => {
    const { normalizedPayload } = normalizeSheetRow(
      buildNormalizeRequest([
        "2026-04-23",
        "Substack",
        "QR guide",
        "Operational title",
        "",
      ]),
    );

    expect(normalizedPayload.normalization.rowQualification.disposition).toBe("QUALIFIED");
    expect(normalizedPayload.workflow.operationalStatus).toBe("BLOCKED");
    expect(normalizedPayload.workflow.blockReason).toBe("MISSING_COPY");
    expect(normalizedPayload.content.title).toBe("Operational title");
  });

  it("falls back to the date placeholder when Title is empty and still routes the row as BLOCKED", () => {
    const { normalizedPayload } = normalizeSheetRow(
      buildNormalizeRequest([
        "2026-04-23",
        "LinkedIn",
        "QR guide",
        "",
        "",
      ]),
    );

    expect(normalizedPayload.normalization.rowQualification.disposition).toBe("QUALIFIED");
    expect(normalizedPayload.workflow.operationalStatus).toBe("BLOCKED");
    expect(normalizedPayload.content.title).toBe("Post — 2026-04-23");
  });
});
