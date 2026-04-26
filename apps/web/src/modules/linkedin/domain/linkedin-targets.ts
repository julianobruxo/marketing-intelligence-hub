export type LinkedInTargetType = "PERSONAL_PROFILE" | "COMPANY_PAGE";

export type LinkedInConnectionStatus =
  | "MOCK_CONNECTED"
  | "NOT_CONNECTED"
  | "PENDING_ORGANIZATION_ACCESS"
  | "MANUAL_ONLY";

export type LinkedInTarget = {
  ownerName: string;
  targetLabel: string;
  targetType: LinkedInTargetType;
  connectionStatus: LinkedInConnectionStatus;
};

export const LINKEDIN_TARGETS: Record<string, LinkedInTarget> = {
  "Yann Kronberg": {
    ownerName: "Yann Kronberg",
    targetLabel: "Yann Kronberg",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Sophian Yacine": {
    ownerName: "Sophian Yacine",
    targetLabel: "Sophian Yacine",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Yuriy Yakovlev": {
    ownerName: "Yuriy Yakovlev",
    targetLabel: "Yuriy Yakovlev",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Cullen Hughes": {
    ownerName: "Cullen Hughes",
    targetLabel: "Cullen Hughes",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Matt Thompson": {
    ownerName: "Matt Thompson",
    targetLabel: "Matt Thompson",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Sean Lally": {
    ownerName: "Sean Lally",
    targetLabel: "Sean Lally",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Stephen Gower": {
    ownerName: "Stephen Gower",
    targetLabel: "Stephen Gower",
    targetType: "PERSONAL_PROFILE",
    connectionStatus: "MOCK_CONNECTED",
  },
  "Zazmic Brazil": {
    ownerName: "Zazmic Brazil",
    targetLabel: "Zazmic Brazil",
    targetType: "COMPANY_PAGE",
    connectionStatus: "PENDING_ORGANIZATION_ACCESS",
  },
  Zazmic: {
    ownerName: "Zazmic",
    targetLabel: "Zazmic",
    targetType: "COMPANY_PAGE",
    connectionStatus: "PENDING_ORGANIZATION_ACCESS",
  },
};

export function resolveLinkedInTarget(ownerName: string | null | undefined): LinkedInTarget | null {
  if (!ownerName) return null;
  return LINKEDIN_TARGETS[ownerName] ?? null;
}

export function isTargetAcceptableForMock(target: LinkedInTarget): boolean {
  return (
    target.connectionStatus === "MOCK_CONNECTED" ||
    target.connectionStatus === "PENDING_ORGANIZATION_ACCESS"
  );
}

export function extractOwnerFromSpreadsheetName(
  spreadsheetName: string | null | undefined,
): string | null {
  if (!spreadsheetName) return null;
  const pipeIndex = spreadsheetName.indexOf("|");
  if (pipeIndex === -1) return null;
  const owner = spreadsheetName.slice(pipeIndex + 1).trim();
  return owner.length > 0 ? owner : null;
}
