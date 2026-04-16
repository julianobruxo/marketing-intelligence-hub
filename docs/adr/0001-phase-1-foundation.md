# ADR 0001: Pipeline #1 Foundation

## Status

Accepted

## Context

Phase 1 is limited to Pipeline #1:

Google Sheets -> Zapier/n8n -> internal platform -> Canva -> LinkedIn

The repository is a greenfield start. The platform must support multiple internal users, restrict access to `@zazmic.com`, and treat the app as the source of truth for workflow state after import.

## Decision

- Use a modular monolith deployed first as a single Cloud Run service.
- Model Zapier/n8n as a first-class upstream ingestion boundary from day one.
- Keep Google Sheets as the planning source of truth.
- Keep workflow state, approvals, comments, mapping, design state, translation state, and publish readiness inside the app.
- Implement Canva behind an adapter boundary with an intentionally narrow initial path.
- Keep translation as a boundary stub in the first slice.

## Consequences

- Import idempotency is part of the core model, not a future patch.
- Source row identity must be preserved separately from canonical content item identity.
- Reprocessing updates source snapshots without resetting internal workflow decisions.
- Future status pushback to Sheets can be added without making Sheets the workflow engine.
