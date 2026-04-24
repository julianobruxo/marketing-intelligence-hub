export const MOCK_SPREADSHEETS = {
  brazil: {
    driveFileId: "mock-brazil-smm-plan",
    spreadsheetName: "Brazil SMM Plan - Apr 2026",
    spreadsheetId: "mock-brazil-smm-plan",
    sourceGroup: "Brazil",
    hasSkippedRows: true,
  },
  yann: {
    driveFileId: "mock-yann-smm-plan",
    spreadsheetName: "Yann Kronberg SMM Plan",
    spreadsheetId: "mock-yann-smm-plan",
    sourceGroup: "Yann",
    hasSkippedRows: false,
  },
  yuri: {
    driveFileId: "mock-yuri-smm-plan",
    spreadsheetName: "Yuri SMM Plan",
    spreadsheetId: "mock-yuri-smm-plan",
    sourceGroup: "Yuri",
    hasSkippedRows: true,
  },
} as const;

export const MOCK_SPREADSHEET_SEQUENCE = [
  MOCK_SPREADSHEETS.brazil,
  MOCK_SPREADSHEETS.yann,
  MOCK_SPREADSHEETS.yuri,
] as const;
