import { google } from "googleapis";
import type { MockSheetRow } from "./mock-import-provider";

/**
 * Maps the live spreadsheet structure to the system's normalization ingestion payload.
 * Expected columns:
 * A: Row Number / Empty
 * B: Date
 * C: Platform
 * D: Title
 * E: LinkedIn Copy
 * F: Substack/Link
 * G: Link IMG
 * H: Content Deadline
 * I: Published ("Yes" / "No")
 * J: Link to the comments
 */
export async function getLiveSheetRows(
  spreadsheetId: string,
  worksheetName: string,
  profile: string,
): Promise<MockSheetRow[]> {
  const serviceAccountEmail = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const serviceAccountKey = process.env.GOOGLE_SERVICE_ACCOUNT_KEY?.replace(/\\n/g, "\n");

  if (!serviceAccountEmail || !serviceAccountKey) {
    throw new Error("missing_credentials");
  }

  const auth = new google.auth.JWT({
    email: serviceAccountEmail,
    key: serviceAccountKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"]
  });

  const sheets = google.sheets({ version: "v4", auth });
  
  const response = await sheets.spreadsheets.values.get({
    spreadsheetId,
    range: `${worksheetName}!A:J`,
  });

  const rawValues = response.data.values;
  if (!rawValues || rawValues.length === 0) {
    return [];
  }

  const parsedRows: MockSheetRow[] = [];

  rawValues.forEach((row, index) => {
    const rowNumber = index + 1;
    
    // Skip top decorative region
    if (rowNumber <= 8) return;

    // Extend row safely to ensure all 10 columns exist to avert access faults
    const safeRow = [...row];
    while (safeRow.length < 10) safeRow.push("");

    const dateStr = safeRow[1]?.trim() ?? "";
    const platform = safeRow[2]?.trim() ?? "";
    const title = safeRow[3]?.trim() ?? "";
    const copy = safeRow[4]?.trim() ?? "";
    const substackLink = safeRow[5]?.trim() ?? "";
    const published = safeRow[8]?.trim() ?? "";

    // Skip "WEEK X" dividers (they only contain values in column A or B typically without data)
    // and skip repeated headers
    if (
      (dateStr.toLowerCase().startsWith("week") || safeRow[0]?.toLowerCase().startsWith("week")) ||
      dateStr.toLowerCase() === "date" ||
      title.toLowerCase() === "title" || 
      title.toLowerCase() === "topic"
    ) {
      return;
    }

    // A row is rejected or skipped if literally everything is functionally empty natively.
    if (!dateStr && !title && !copy && !platform) {
      return;
    }

    // Generate output schema safely bypassing missing index structures
    parsedRows.push({
      profile,
      platformLabel: platform,
      // Default to STATIC_POST for anything here unless determined explicitly via complex schema later
      contentType: "STATIC_POST",
      locale: "en",
      translationRequired: false,
      plannedDate: dateStr,
      sourceAssetLink: substackLink,
      title: title,
      copyEnglish: copy,
      copyPortuguese: undefined,
      publishedFlag: published,
      derivedTitleType: "EXPLICIT_MAPPED_FIELD",
      derivedTitleSource: "campaignLabel", // Sourced indirectly via normalization logic loosely matching existing
      // Fallback variables expected heavily by existing normalizers
      headerRowNumber: 9, // Explicit arbitrary anchor
      headers: ["Date", "Platform", "Title", "Copy", "Published"],
      rowNumber,
      // Ensure idempotency uniqueness globally via row ID hashes tracking
      rowId: `sheet-${spreadsheetId}-${worksheetName}-row-${rowNumber}`,
      rowValues: safeRow,
    } as MockSheetRow);
  });

  return parsedRows;
}
