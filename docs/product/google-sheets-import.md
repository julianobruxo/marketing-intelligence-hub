# Google Drive Import Boundary

## Design posture

The spreadsheet is treated as a human-operated planning surface, not as a clean database table.

Because of that, the import boundary must support:

- configurable header mapping
- extra columns and monthly worksheet drift
- non-data sections such as week dividers and reference blocks
- preview and commit modes
- metadata-only upstream fields that never override app-owned workflow state

## Import stages

1. Select a spreadsheet from the designated Google Drive folder.
2. Select the worksheet/tab inside that spreadsheet.
3. Normalize headers through aliases and config.
4. Qualify or reject each row.
5. Transform the row into canonical content, planning data, and source metadata.

## Modes

- `PREVIEW`
  Persists a preview receipt only. It validates worksheet selection, header mapping, row
  qualification, title derivation, and normalized payload shape without mutating canonical
  content records.
- `COMMIT`
Persists a commit receipt and then creates or updates the canonical content item linked to
the Google Drive spreadsheet row.

## Title derivation order

1. Explicit mapped field defined by profile config
2. Configurable profile fallback field
3. Heuristic fallback only as a last resort

## Field ownership

Google Drive spreadsheets own upstream planning input.

The app owns:

- statuses
- approvals
- comments
- revision notes
- template mapping
- design state
- asset tracking
- translation state
- publish readiness

## Metadata-only source fields

`publishedFlag` and `publishedPostUrl` remain source metadata only unless a later controlled reconciliation rule is introduced.

## Reprocessing

Reprocessing uses the stable spreadsheet row identity to find the canonical content item:

- spreadsheet id
- worksheet id
- row id

The idempotency key also includes row version and mode. That means:

- repeated delivery of the same row version in the same mode is treated as a duplicate receipt
- a new row version for the same source row reprocesses the existing canonical item instead of
  creating a second one
