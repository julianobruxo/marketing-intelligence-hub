import "server-only";

import { z } from "zod";
import { getOpenAIClient } from "@/lib/openai-client";
import { DRIVE_PROVIDER_MODE } from "@/shared/config/env";
import { logEvent } from "@/shared/logging/logger";

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

const aiSheetRowSemanticSchema = z.object({
  has_title: z.boolean(),
  has_final_copy: z.boolean(),
  is_published: z.boolean(),
  has_design_evidence: z.boolean(),
  is_overdue: z.boolean().nullable(),
  is_empty_or_unusable: z.boolean(),
  is_non_linkedin_platform: z.boolean(),
  copy_language_is_fallback: z.boolean(),
  needs_human_review: z.boolean(),
  reasoning: z.array(z.string()),
});

const aiSheetRowSchema = z.object({
  rowIndex: z.number().int().positive(),
  data: aiSheetRowDataSchema,
  semantic: aiSheetRowSemanticSchema,
});

export const aiSheetAnalysisResultSchema = z.object({
  tableDetected: z.boolean(),
  columns: aiSheetColumnsSchema,
  rows: z.array(aiSheetRowSchema),
});

export type AiSheetAnalysisResult = z.infer<typeof aiSheetAnalysisResultSchema>;
export type AiSheetAnalysisRow = z.infer<typeof aiSheetRowSchema>;

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
          semantic: {
            type: "object",
            additionalProperties: false,
            properties: {
              has_title: { type: "boolean" },
              has_final_copy: { type: "boolean" },
              is_published: { type: "boolean" },
              has_design_evidence: { type: "boolean" },
              is_overdue: { type: ["boolean", "null"] },
              is_empty_or_unusable: { type: "boolean" },
              is_non_linkedin_platform: { type: "boolean" },
              copy_language_is_fallback: { type: "boolean" },
              needs_human_review: { type: "boolean" },
              reasoning: {
                type: "array",
                items: { type: "string" },
              },
            },
            required: [
              "has_title",
              "has_final_copy",
              "is_published",
              "has_design_evidence",
              "is_overdue",
              "is_empty_or_unusable",
              "is_non_linkedin_platform",
              "copy_language_is_fallback",
              "needs_human_review",
              "reasoning",
            ],
          },
        },
        required: ["rowIndex", "data", "semantic"],
      },
    },
  },
  required: ["tableDetected", "columns", "rows"],
} as const;

const AI_SHEET_ANALYSIS_PROMPT = `You are a strict spreadsheet interpretation and workflow-extraction agent for the Marketing Intelligence Hub.

Your job is to read the entire imported spreadsheet structure first, understand what each field actually means, and then return only the rows and fields that truly belong to the workflow.

Do NOT guess.
Do NOT classify rows from isolated cells.
Do NOT assume fixed column letters across all plans.
Do NOT invent metadata.

Today is provided in the user payload as "todayDate" and must be used for overdue checks.

# STEP 1 — READ THE FULL STRUCTURE FIRST
Before classifying any row, survey the entire sheet:
- Identify which block is the operational content planning table.
- Identify any top-sheet admin noise: social profile metadata, connection counts, access credentials, booking links, QR code areas, decorative merged cells. These are NOT workflow rows.
- Identify the real column headers of the operational table. Column positions may differ across sheets — do not assume fixed positions.

# STEP 2 — CLASSIFY EACH ROW
For each row BELOW the operational table header, produce one entry.

Do NOT produce entries for:
- rows that are part of the top-sheet admin/header block
- access detail rows
- social profile metadata rows
- decorative or fully blank rows
- rows whose only content is in a non-operational header section

# STRICT FIELD MAPPING RULES

## data.title
Map here ONLY when the cell contains a specific content-item title — a name that identifies this particular piece of content.
Do NOT map here when the cell contains a generic topic or category label such as "News/Updates", "Industry Insight", "Thought Leadership", "Personal Story", or any other categorical phrase that classifies many posts.
If a cell value is short (40 characters or fewer), contains no sentence-ending punctuation, and looks like a category or theme label, set title to null for that row.

## data.copy
Map here ONLY when the cell contains polished, publication-ready body text — the actual LinkedIn post text.
Task descriptions, editorial briefs, instructions, and topic labels are never final copy.
When both an English copy field and a non-English copy field are present in a row:
  - Extract the English value into data.copy.
  - Set copy_language_is_fallback to false.
When only a non-English copy field exists and the English field is empty/null:
  - Extract the non-English value into data.copy.
  - Set copy_language_is_fallback to true.
When no copy at all exists, set data.copy to null and copy_language_is_fallback to false.

## data.date
The planned/scheduled date for this content item.

## data.deadline
The content production deadline, distinct from the planned posting date.

## data.published
The published/posted marker or direct post URL, if present.

## data.channel
The distribution platform. Extract as-is from the channel/platform cell.

# SEMANTIC FLAG RULES

## has_title
true when data.title contains a specific content-item title (not a category label).
false otherwise.

## has_final_copy
true only when data.copy contains polished, publication-ready text.
A task description, brief, or topic label is never final copy.
false when data.copy is null or contains only instructional/categorical text.

## is_published
true only when explicit evidence: Published field says Yes/posted/done, or a direct LinkedIn post URL is present.
Generic links, draft links, or image asset URLs are NOT publication proof.

## has_design_evidence
true when an image URL, asset link, or Canva link is present in any cell of the row.

## is_overdue
Compute from data.deadline vs todayDate. null when deadline is missing or unparseable.

## is_empty_or_unusable
true when the row has no usable content for the workflow.
true when the row belongs to a non-operational section (admin, header noise, profile metadata).

## is_non_linkedin_platform
true when data.channel explicitly names a non-LinkedIn platform:
X, X.com, X Account, Twitter, x/twitter, Substack, Instagram, YouTube, TikTok, Facebook, Threads, Newsletter, Blog.
false when channel is LinkedIn, empty, or null.
A row with is_non_linkedin_platform true must also have is_empty_or_unusable true — it does not belong in the LinkedIn workflow.

## copy_language_is_fallback
true when data.copy was populated from a non-English field because no English copy existed.
false in all other cases.

## needs_human_review
true when evidence is weak, conflicting, or ambiguous.

# OUTPUT
Return:
1) tableDetected (true/false)
2) columns — the real column header letter/name for each logical field detected
3) rows[] — one entry per operational content row with rowIndex, data, and semantic

Output constraints:
- JSON only, schema-compliant.
- No prose outside JSON.
- Be conservative. When in doubt, needs_human_review = true.
`;

function sanitizeCellValue(value: unknown): string {
  if (value === null || value === undefined) return "";

  return String(value)
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .slice(0, 10000)
    .trim();
}

function normalizeRows(rows: string[][]) {
  return rows.map((row) => row.map((cell) => sanitizeCellValue(cell)));
}

function buildEmptyAnalysisResult(): AiSheetAnalysisResult {
  return {
    tableDetected: false,
    columns: {
      date: null,
      title: null,
      copy: null,
      deadline: null,
      published: null,
      channel: null,
    },
    rows: [],
  };
}

function safeJsonParse<T>(raw: string, fallback: T): T {
  try {
    return JSON.parse(raw) as T;
  } catch (error) {
    logEvent("error", "[IMPORT] JSON parse failed", {
      error: error instanceof Error ? error.message : String(error),
      preview: raw.slice(0, 200),
    });
    return fallback;
  }
}

function buildUserPayload(input: AiSheetAnalyzerInput) {
  return JSON.stringify(
    {
      todayDate: new Date().toISOString().slice(0, 10),
      spreadsheetName: sanitizeCellValue(input.spreadsheetName),
      sheetName: sanitizeCellValue(input.sheetName),
      detectedHeaders: input.detectedHeaders?.map((header) => sanitizeCellValue(header)) ?? null,
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

function countAcceptedRows(parsed: AiSheetAnalysisResult) {
  return parsed.rows.filter((row) => {
    if (row.semantic.is_empty_or_unusable) {
      return false;
    }

    return (
      row.semantic.has_title ||
      row.semantic.has_final_copy ||
      row.semantic.is_published
    );
  }).length;
}

function normalizeCellText(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function findHeaderIndex(headers: string[], aliases: string[]) {
  const normalizedAliases = aliases.map((alias) => normalizeCellText(alias).toLowerCase());

  return headers.findIndex((header) => {
    const normalizedHeader = normalizeCellText(header).toLowerCase();
    return normalizedAliases.some(
      (alias) => normalizedHeader === alias || normalizedHeader.includes(alias) || alias.includes(normalizedHeader),
    );
  });
}

function buildMockAnalysisResult(input: AiSheetAnalyzerInput): AiSheetAnalysisResult {
  const headers = input.detectedHeaders?.map((header) => sanitizeCellValue(header)) ?? normalizeRows([input.rows[0] ?? []])[0] ?? [];
  const dataRows = normalizeRows(input.rows.slice(1));

  const columnIndexes = {
    date: findHeaderIndex(headers, ["Date", "Planned date"]),
    title: findHeaderIndex(headers, ["Campaign", "Title", "Headline", "Post title"]),
    copy: findHeaderIndex(headers, ["LinkedIn Copy", "Copy", "English copy"]),
    deadline: findHeaderIndex(headers, ["Content Deadline", "Deadline", "Due date"]),
    published: findHeaderIndex(headers, ["Published", "Status", "Posted"]),
    channel: findHeaderIndex(headers, ["Platform", "Channel", "Account", "Person"]),
  };

  const columns = {
    date: columnIndexes.date >= 0 ? headers[columnIndexes.date] ?? null : null,
    title: columnIndexes.title >= 0 ? headers[columnIndexes.title] ?? null : null,
    copy: columnIndexes.copy >= 0 ? headers[columnIndexes.copy] ?? null : null,
    deadline: columnIndexes.deadline >= 0 ? headers[columnIndexes.deadline] ?? null : null,
    published: columnIndexes.published >= 0 ? headers[columnIndexes.published] ?? null : null,
    channel: columnIndexes.channel >= 0 ? headers[columnIndexes.channel] ?? null : null,
  };

  const rows = dataRows.map((rowValues, offset) => {
    const rowIndex = offset + 2;
    const normalizedValues = rowValues.map((value) => normalizeCellText(value));
    const joined = normalizedValues.join(" ").trim();
    const isSkipRow = !joined || /^(week\s*\d+|hashtags?|qr code|notes?|helper|links?)\b/i.test(joined);

    if (isSkipRow) {
      return {
        rowIndex,
        data: {
          date: null,
          title: null,
          copy: null,
          deadline: null,
          published: null,
          channel: null,
        },
        semantic: {
          has_title: false,
          has_final_copy: false,
          is_published: false,
          has_design_evidence: false,
          is_overdue: null,
          is_empty_or_unusable: true,
          is_non_linkedin_platform: false,
          copy_language_is_fallback: false,
          needs_human_review: false,
          reasoning: ["Mock analyzer marked this as a non-data row."],
        },
      };
    }

    const readCell = (index: number) => (index >= 0 ? normalizedValues[index] ?? null : null);
    const date = readCell(columnIndexes.date);
    const title = readCell(columnIndexes.title);
    const copy = readCell(columnIndexes.copy);
    const deadline = readCell(columnIndexes.deadline);
    const published = readCell(columnIndexes.published);
    const channel = readCell(columnIndexes.channel);
    const hasDesignEvidence = normalizedValues.some((value) => /https?:\/\/|canva/i.test(value));
    const isPublished = Boolean(published && /yes|posted|done|complete|completed|live/i.test(published));
    const isOverdue = deadline ? (Number.isNaN(new Date(deadline).getTime()) ? null : new Date(deadline).getTime() < Date.now()) : null;

    return {
      rowIndex,
      data: {
        date,
        title,
        copy,
        deadline,
        published,
        channel,
      },
      semantic: {
        has_title: Boolean(title),
        has_final_copy: Boolean(copy && copy.length >= 40),
        is_published: isPublished,
        has_design_evidence: hasDesignEvidence,
        is_overdue: isOverdue,
        is_empty_or_unusable: false,
        is_non_linkedin_platform: Boolean(channel && !/linkedin/i.test(channel)),
        copy_language_is_fallback: false,
        needs_human_review: Boolean(!title || !copy || copy.length < 40),
        reasoning: [
          "Mock analyzer inferred the row from the local workbook fixture.",
          joined.length > 0 ? "Row contained operational content." : "Row contained no usable content.",
        ],
      },
    };
  }) satisfies AiSheetAnalysisResult["rows"];

  return {
    tableDetected: rows.length > 0,
    columns,
    rows,
  };
}

export async function analyzeSheetWithAI(input: AiSheetAnalyzerInput): Promise<AiSheetAnalysisResult> {
  if (DRIVE_PROVIDER_MODE === "MOCK") {
    const parsed = aiSheetAnalysisResultSchema.parse(buildMockAnalysisResult(input));

    logEvent("info", "[TRACE_IMPORT_QUEUE][AI_ANALYZER] mock", {
      spreadsheetName: input.spreadsheetName,
      sheetName: input.sheetName,
      tableDetected: parsed.tableDetected,
      analyzedRows: parsed.rows.length,
    });

    return parsed;
  }

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

  const rawParsed = safeJsonParse<unknown>(response.output_text, null);
  const parsedResult = aiSheetAnalysisResultSchema.safeParse(rawParsed);

  if (!parsedResult.success) {
    logEvent("error", "[TRACE_IMPORT_QUEUE][AI_ANALYZER] schema-parse-failed", {
      spreadsheetName: input.spreadsheetName,
      sheetName: input.sheetName,
      error: parsedResult.error.message,
      preview: response.output_text.slice(0, 200),
    });
    return buildEmptyAnalysisResult();
  }

  const parsed = parsedResult.data;
  const reviewRows = parsed.rows.filter((row) => row.semantic.needs_human_review).length;
  const acceptedRows = countAcceptedRows(parsed);

  logEvent("info", "[TRACE_IMPORT_QUEUE][AI_ANALYZER] result", {
    spreadsheetName: input.spreadsheetName,
    sheetName: input.sheetName,
    tableDetected: parsed.tableDetected,
    analyzedRows: parsed.rows.length,
    acceptedRows,
    reviewRows,
    columns: parsed.columns,
  });

  return parsed;
}
