import "server-only";

import type { DriveSpreadsheetRecord } from "../domain/drive-import";
import type { GoogleSheetsRawSpreadsheetImport } from "./google-sheets-provider";

type MockSpreadsheetFixture = {
  spreadsheetId: string;
  spreadsheetName: string;
  worksheets: Array<{
    worksheetId: string;
    worksheetName: string;
    rows: string[][];
  }>;
};

function createSharedHeaderRow() {
  return [
    "Date",
    "Platform",
    "Campaign",
    "Notes for copywriter",
    "LinkedIn Copy",
    "Portuguese version",
    "Link IMG",
    "Content Deadline",
    "Published",
    "Link to the post",
  ];
}

function createValidRow(input: {
  date: string;
  campaign: string;
  notes: string;
  copy: string;
  assetUrl: string;
  deadline: string;
  published?: string;
  postUrl?: string;
}) {
  return [
    input.date,
    "LinkedIn",
    input.campaign,
    input.notes,
    input.copy,
    "",
    input.assetUrl,
    input.deadline,
    input.published ?? "No",
    input.postUrl ?? "",
  ];
}

function createSkipRow(label: string) {
  return [label, "", "", "", "", "", "", "", "", ""];
}

function buildBrazilFixture(): MockSpreadsheetFixture {
  const header = createSharedHeaderRow();

  return {
    spreadsheetId: "mock-brazil-smm-plan",
    spreadsheetName: "Brazil SMM Plan - Apr 2026",
    worksheets: [
      {
        worksheetId: "apr-2026",
        worksheetName: "Apr 2026",
        rows: [
          header,
          createValidRow({
            date: "2026-04-03",
            campaign: "Brazil launch post",
            notes: "Launch campaign brief",
            copy:
              "This is a polished LinkedIn copy for the Brazil launch campaign. It highlights the value proposition, includes a CTA, and is long enough to qualify as real content.",
            assetUrl: "https://assets.local/brazil-launch.png",
            deadline: "2026-04-02",
          }),
          createSkipRow("Week 1"),
          createValidRow({
            date: "2026-04-10",
            campaign: "Customer proof story",
            notes: "Customer proof story brief",
            copy:
              "Here is another polished LinkedIn copy for a customer proof story. It includes proof, value, and a closing CTA so it reads like a real post.",
            assetUrl: "https://assets.local/customer-proof.png",
            deadline: "2026-04-09",
          }),
          createSkipRow("Hashtags"),
          createValidRow({
            date: "2026-04-18",
            campaign: "Partner spotlight",
            notes: "Partner spotlight brief",
            copy:
              "This third LinkedIn copy is also polished, detailed, and ready for workflow staging. It mentions a partner story and includes a call to action.",
            assetUrl: "https://assets.local/partner-spotlight.png",
            deadline: "2026-04-17",
          }),
        ],
      },
    ],
  };
}

function buildYannFixture(): MockSpreadsheetFixture {
  const header = createSharedHeaderRow();

  return {
    spreadsheetId: "mock-yann-smm-plan",
    spreadsheetName: "Yann Kronberg SMM Plan",
    worksheets: [
      {
        worksheetId: "active",
        worksheetName: "Active Plan",
        rows: [
          header,
          createValidRow({
            date: "2026-04-05",
            campaign: "Founder note",
            notes: "Founder note brief",
            copy:
              "This is a polished founder-led LinkedIn post with a clear point of view, a concrete takeaway, and a compelling call to action.",
            assetUrl: "https://assets.local/founder-note.png",
            deadline: "2026-04-04",
          }),
          createValidRow({
            date: "2026-04-12",
            campaign: "Product perspective",
            notes: "Product perspective brief",
            copy:
              "Another polished LinkedIn copy about product perspective and customer value. It is long enough to qualify and should stage cleanly.",
            assetUrl: "https://assets.local/product-perspective.png",
            deadline: "2026-04-11",
          }),
        ],
      },
    ],
  };
}

function buildYuriFixture(): MockSpreadsheetFixture {
  const header = createSharedHeaderRow();

  return {
    spreadsheetId: "mock-yuri-smm-plan",
    spreadsheetName: "Yuri SMM Plan",
    worksheets: [
      {
        worksheetId: "q2-2026",
        worksheetName: "Q2 2026",
        rows: [
          header,
          createValidRow({
            date: "2026-04-08",
            campaign: "Enterprise angle",
            notes: "Enterprise angle brief",
            copy:
              "This enterprise-focused LinkedIn post is polished, specific, and long enough to qualify for staging and later design work.",
            assetUrl: "https://assets.local/enterprise-angle.png",
            deadline: "2026-04-07",
          }),
          createSkipRow("Week 2"),
        ],
      },
    ],
  };
}

const MOCK_WORKBOOK_FIXTURES: MockSpreadsheetFixture[] = [
  buildBrazilFixture(),
  buildYannFixture(),
  buildYuriFixture(),
];

function getFixture(spreadsheetId: string) {
  return MOCK_WORKBOOK_FIXTURES.find((fixture) => fixture.spreadsheetId === spreadsheetId) ?? null;
}

export function getMockGoogleSpreadsheetWorkbook(
  input: Pick<DriveSpreadsheetRecord, "driveFileId" | "spreadsheetId" | "spreadsheetName" | "sourceContext">,
): GoogleSheetsRawSpreadsheetImport {
  const fixture = getFixture(input.spreadsheetId);

  if (!fixture) {
    throw new Error(`No mock Google Sheets workbook fixture found for ${input.spreadsheetId}.`);
  }

  return {
    spreadsheetId: fixture.spreadsheetId,
    spreadsheetName: fixture.spreadsheetName,
    availableWorksheets: fixture.worksheets.map((worksheet) => ({
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
    })),
    worksheets: fixture.worksheets.map((worksheet) => ({
      worksheetId: worksheet.worksheetId,
      worksheetName: worksheet.worksheetName,
      rows: worksheet.rows,
      detectedHeaders: worksheet.rows[0] ?? [],
      detectedHeaderRowNumber: 1,
    })),
  };
}
