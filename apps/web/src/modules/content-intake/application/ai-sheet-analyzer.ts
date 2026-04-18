import "server-only";

import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai-client";
import { logEvent } from "@/shared/logging/logger";

const aiSheetStatusSchema = z.enum([
  "WAITING_FOR_COPY",
  "READY_FOR_DESIGN",
  "LATE",
  "PUBLISHED",
]);

// Structured classification of every row in the sheet
const aiSheetRowTypeSchema = z.enum([
  "CONTENT_ITEM",    // A real marketing work item — a post to be created or published
  "EMPTY_ROW",       // All cells blank or whitespace only
  "WEEK_SEPARATOR",  // Week boundary row: "Week 1", "WEEK 2", "Semana 1", "W3"
  "SECTION_HEADING", // Organizational heading for a group, not an individual post
  "REPEATED_HEADER", // Repeats the table column headers (common in long sheets)
  "METADATA_BLOCK",  // Brand notes, strategy notes, team instructions — not a post
  "REFERENCE_BLOCK", // Hashtag banks, QR codes, links collections — not a post
  "AMBIGUOUS",       // Cannot be confidently classified — use sparingly
]);

// How confident the AI is in the classification
const aiSheetConfidenceSchema = z.enum(["HIGH", "MEDIUM", "LOW"]);

const aiSheetColumnValueSchema = z.string().nullable();

const aiSheetColumnsSchema = z.object({
  date: aiSheetColumnValueSchema,
  title: aiSheetColumnValueSchema,
  copy: aiSheetColumnValueSchema,
  deadline: aiSheetColumnValueSchema,
  published: aiSheetColumnValueSchema,
  channel: aiSheetColumnValueSchema,
});

const aiSheetRowDataSchema = z.object({
  date: aiSheetColumnValueSchema,
  title: aiSheetColumnValueSchema,
  copy: aiSheetColumnValueSchema,
  deadline: aiSheetColumnValueSchema,
  published: aiSheetColumnValueSchema,
  channel: aiSheetColumnValueSchema,
});

const aiSheetRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  rowType: aiSheetRowTypeSchema,
  isValid: z.boolean(),
  confidence: aiSheetConfidenceSchema,
  reason: z.string(),
  data: aiSheetRowDataSchema,
  suggestedStatus: aiSheetStatusSchema,
});

export const aiSheetAnalysisResultSchema = z.object({
  tableDetected: z.boolean(),
  columns: aiSheetColumnsSchema,
  rows: z.array(aiSheetRowSchema),
});

export type AiSheetAnalysisResult = z.infer<typeof aiSheetAnalysisResultSchema>;
export type AiSheetAnalysisRow = z.infer<typeof aiSheetRowSchema>;
export type AiSheetRowType = z.infer<typeof aiSheetRowTypeSchema>;
export type AiSheetConfidence = z.infer<typeof aiSheetConfidenceSchema>;

const AI_SHEET_ANALYSIS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  properties: {
    tableDetected: { type: "boolean" },
    columns: {
      type: "object",
      additionalProperties: false,
      properties: {
        date: { type: ["string", "null"] },
        title: { type: ["string", "null"] },
        copy: { type: ["string", "null"] },
        deadline: { type: ["string", "null"] },
        published: { type: ["string", "null"] },
        channel: { type: ["string", "null"] },
      },
      required: ["date", "title", "copy", "deadline", "published", "channel"],
    },
    rows: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          rowIndex: { type: "integer" },
          rowType: {
            type: "string",
            enum: [
              "CONTENT_ITEM",
              "EMPTY_ROW",
              "WEEK_SEPARATOR",
              "SECTION_HEADING",
              "REPEATED_HEADER",
              "METADATA_BLOCK",
              "REFERENCE_BLOCK",
              "AMBIGUOUS",
            ],
          },
          isValid: { type: "boolean" },
          confidence: {
            type: "string",
            enum: ["HIGH", "MEDIUM", "LOW"],
          },
          reason: { type: "string" },
          data: {
            type: "object",
            additionalProperties: false,
            properties: {
              date: { type: ["string", "null"] },
              title: { type: ["string", "null"] },
              copy: { type: ["string", "null"] },
              deadline: { type: ["string", "null"] },
              published: { type: ["string", "null"] },
              channel: { type: ["string", "null"] },
            },
            required: ["date", "title", "copy", "deadline", "published", "channel"],
          },
          suggestedStatus: {
            type: "string",
            enum: ["WAITING_FOR_COPY", "READY_FOR_DESIGN", "LATE", "PUBLISHED"],
          },
        },
        required: ["rowIndex", "rowType", "isValid", "confidence", "reason", "data", "suggestedStatus"],
      },
    },
  },
  required: ["tableDetected", "columns", "rows"],
} as const;

const AI_SHEET_ANALYSIS_PROMPT = `You are an expert at analyzing marketing content planning spreadsheets.

## Your role

These are internal marketing operations sheets that track social media posts (LinkedIn, Instagram, Substack, etc.) at various stages of planning and production.

For each worksheet you will:
1. Determine if it contains a content planning table (tableDetected)
2. Identify the column mapping for that table
3. Classify every row below the detected header row

## Row types — classify every row as exactly one

**CONTENT_ITEM**
A real marketing work item describing a specific piece of content to be created or published.
A CONTENT_ITEM MUST have at least: a title/idea describing what the post is about, OR actual copy text.
A date or channel alone does NOT make a content item.

**EMPTY_ROW**
All cells are empty, contain only whitespace, or have no visible content.

**WEEK_SEPARATOR**
A row that marks a week boundary — it is a label, not content.
Examples: "Week 1", "WEEK 2", "Semana 1", "Week 3 – High Performance", "W1", "W2 –"

**SECTION_HEADING**
An organizational heading that groups content items but is not itself an individual post.
Examples: "High Performance Content", "MONTHLY GOALS: ...", "Always-on content", "Awareness posts", "Q2 PLANNING"

**REPEATED_HEADER**
A row that repeats the column header labels. Common in long sheets where headers are repeated mid-sheet.
Example: a row with "Date", "Platform", "Title", "Copy", "Published" in roughly the right positions.

**METADATA_BLOCK**
A row with reference, brand, or strategy information that is not an individual post.
Examples: "Brand voice: professional but approachable", "Notes: review before posting", "Team: Jane (copy), Bob (design)"

**REFERENCE_BLOCK**
A row containing supplementary material that supports the plan but is not a post itself.
Examples: "Hashtags: #marketing #b2b #linkedin", "QR Code link: https://...", "Link block:", "Image bank: https://..."

**AMBIGUOUS**
Genuinely cannot be classified. Use only when truly unclear. Ambiguous rows get isValid: false.

## The isValid field

- Set isValid: **true** only when rowType is CONTENT_ITEM
- Set isValid: **false** for every other rowType (including AMBIGUOUS)

## Confidence levels

For CONTENT_ITEM rows, confidence reflects how much useful content the row contains:
- **HIGH**: Has title/idea + copy, OR has title/idea + date + channel (3 or more strong signals)
- **MEDIUM**: Has title/idea OR copy, plus at least one scheduling signal (date, deadline, or channel)
- **LOW**: Has only title/idea OR only copy, with no other context — possibly an early-stage idea or placeholder

For non-CONTENT_ITEM rows, confidence reflects certainty of the classification:
- **HIGH**: Very certain this row is not a content item
- **MEDIUM**: Fairly sure it is not a content item
- **LOW**: Uncertain — this might actually be a content item (when this happens, use AMBIGUOUS instead)

## Column detection — use semantic understanding, not exact matching

The same column may appear under many names. Identify it by meaning:
- Date column: "Date", "Planned date", "Post date", "Day", "Scheduled"
- Title column: "Title", "Post title", "Idea", "Topic", "Theme", "Campaign", "Post idea", "Content idea"
- Copy column: "Copy", "LinkedIn Copy", "LinkedIn – up to 3000 characters", "Post copy", "English copy", "Text", "LinkedIn", "Caption"
- Deadline column: "Deadline", "Content deadline", "Due date", "Due", "Deliver by"
- Published column: "Published", "Posted", "Status", "Done", "Live", "Published?", "Went live"
- Channel column: "Platform", "Channel", "Account", "Network", "Where"

## Valid row examples (always include these)

| date | title | copy | channel | → rowType | confidence |
|------|-------|------|---------|-----------|------------|
| Apr 15 | AI trends post | LinkedIn just updated… | LinkedIn | CONTENT_ITEM | HIGH |
| Apr 20 | Product launch announcement | (empty) | LinkedIn | CONTENT_ITEM | MEDIUM |
| (empty) | Customer success story | We helped XYZ company… | (empty) | CONTENT_ITEM | MEDIUM |
| (empty) | Marketing automation ideas | (empty) | (empty) | CONTENT_ITEM | LOW |
| May 1 | Quarterly review | (empty) | LinkedIn | CONTENT_ITEM | MEDIUM |

## Invalid row examples (always exclude these)

| cells | → rowType |
|-------|-----------|
| "Week 1", "", "", "" | WEEK_SEPARATOR |
| "Week 2 – Performance Content", "", "" | WEEK_SEPARATOR |
| "High Performance Content", "", "" | SECTION_HEADING |
| "MONTHLY GOALS: Increase followers 15%", "" | SECTION_HEADING |
| "Date", "Platform", "Title", "Copy", "Published" | REPEATED_HEADER |
| "Hashtags: #marketing #b2b #linkedin", "" | REFERENCE_BLOCK |
| "QR Code: https://qr.example.com", "" | REFERENCE_BLOCK |
| "Brand voice: professional", "" | METADATA_BLOCK |
| "", "", "", "" | EMPTY_ROW |
| "Apr 2026", "", "", "" | SECTION_HEADING (month label, no post content) |
| "Apr 15", "", "", "" | SECTION_HEADING (date-only, no title/copy = not a post) |

## tableDetected rule

Set tableDetected: true if the worksheet contains a structured grid of marketing content rows.
Set tableDetected: false for dashboards, summary sheets, reference-only sheets, or sheets with no table structure.
When in doubt, set tableDetected: true and let row classification handle the filtering.
If tableDetected is false, return an empty rows array.

## Key rules

1. Return a rows[] entry for EVERY row below the detected header — including all non-data rows.
2. rowIndex MUST be the exact 1-based row number as provided in the input. Do not renumber. Do not skip.
3. For non-CONTENT_ITEM rows: set all data fields to null and suggestedStatus to "WAITING_FOR_COPY".
4. Many CONTENT_ITEM rows have no copy yet — this is completely normal. Do not reject them for missing copy.
5. Incomplete rows that represent real planned work MUST be included as CONTENT_ITEM.
6. Do NOT require copy to be present. Copy-pending planned items are valid.
7. When borderline, prefer CONTENT_ITEM over AMBIGUOUS to avoid dropping real work.

## Status rules — for CONTENT_ITEM rows only

- published field contains "Yes", "Published", "Done", "Live", "Complete", "✓" → PUBLISHED
- copy text is absent or empty → WAITING_FOR_COPY
- deadline exists and appears to be in the past → LATE
- otherwise → READY_FOR_DESIGN

Return ONLY valid JSON matching the schema. No explanations outside the JSON.`;

function normalizeRows(rows: string[][]) {
  return rows.map((row) => row.map((cell) => `${cell ?? ""}`));
}

function buildUserPayload(input: AiSheetAnalyzerInput) {
  return JSON.stringify(
    {
      spreadsheetName: input.spreadsheetName,
      sheetName: input.sheetName,
      detectedHeaders: input.detectedHeaders ?? null,
      rawRows: normalizeRows(input.rows),
    },
    null,
    2,
  );
}

export type AiSheetAnalyzerInput = {
  spreadsheetName: string;
  sheetName: string;
  rows: string[][];
  detectedHeaders?: string[];
};

export async function analyzeSheetWithAI(input: AiSheetAnalyzerInput): Promise<AiSheetAnalysisResult> {
  const openai = getOpenAIClient();

  logEvent("info", "[TRACE_IMPORT_QUEUE][AI_ANALYZER] start", {
    spreadsheetName: input.spreadsheetName,
    sheetName: input.sheetName,
    rowCount: input.rows.length,
    detectedHeaders: input.detectedHeaders ?? [],
  });

  const response = await openai.responses.create({
    model: "gpt-5.4-mini",
    reasoning: {
      effort: "low",
    },
    max_output_tokens: 12000,
    input: [
      {
        role: "system",
        content: AI_SHEET_ANALYSIS_PROMPT,
      },
      {
        role: "user",
        content: buildUserPayload(input),
      },
    ],
    text: {
      format: {
        type: "json_schema",
        name: "marketing_sheet_analysis",
        schema: AI_SHEET_ANALYSIS_SCHEMA,
        strict: true,
      },
    },
  });

  const parsed = aiSheetAnalysisResultSchema.parse(JSON.parse(response.output_text));

  const validRows = parsed.rows.filter((row) => row.isValid);
  const invalidRows = parsed.rows.filter((row) => !row.isValid);
  const confidenceCounts = validRows.reduce(
    (acc, row) => {
      acc[row.confidence] = (acc[row.confidence] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );
  const rowTypeCounts = parsed.rows.reduce(
    (acc, row) => {
      acc[row.rowType] = (acc[row.rowType] ?? 0) + 1;
      return acc;
    },
    {} as Record<string, number>,
  );

  logEvent("info", "[TRACE_IMPORT_QUEUE][AI_ANALYZER] result", {
    spreadsheetName: input.spreadsheetName,
    sheetName: input.sheetName,
    tableDetected: parsed.tableDetected,
    analyzedRows: parsed.rows.length,
    validRows: validRows.length,
    invalidRows: invalidRows.length,
    columns: parsed.columns,
    confidenceCounts,
    rowTypeCounts,
  });

  return parsed;
}
