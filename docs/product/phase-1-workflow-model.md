# Phase 1 Workflow Model

This document describes the current phase-1 workflow contract for Pipeline #1.

It is intentionally stable for the current implementation, but it is not treated as final business truth. The architecture is designed so the workflow can evolve later without redesigning the whole system.

## Workflow Version

`phase-1.0`

## Core States

- `IMPORTED`
- `IN_REVIEW`
- `CHANGES_REQUESTED`
- `CONTENT_APPROVED`
- `DESIGN_REQUESTED`
- `DESIGN_IN_PROGRESS`
- `DESIGN_FAILED`
- `DESIGN_READY`
- `DESIGN_APPROVED`
- `TRANSLATION_PENDING`
- `TRANSLATION_APPROVED`
- `READY_TO_PUBLISH`
- `PUBLISHED_MANUALLY`

## Allowed Next States

- `IMPORTED` -> `IN_REVIEW`, `CHANGES_REQUESTED`, `CONTENT_APPROVED`
- `IN_REVIEW` -> `CHANGES_REQUESTED`, `CONTENT_APPROVED`
- `CHANGES_REQUESTED` -> `IN_REVIEW`, `CONTENT_APPROVED`
- `CONTENT_APPROVED` -> `DESIGN_REQUESTED`, `CHANGES_REQUESTED`, `CONTENT_APPROVED`
- `DESIGN_REQUESTED` -> `DESIGN_IN_PROGRESS`, `DESIGN_FAILED`
- `DESIGN_IN_PROGRESS` -> `DESIGN_IN_PROGRESS`, `DESIGN_READY`, `DESIGN_FAILED`
- `DESIGN_FAILED` -> `DESIGN_REQUESTED`
- `DESIGN_READY` -> `DESIGN_APPROVED`, `CHANGES_REQUESTED`
- `DESIGN_APPROVED` -> `TRANSLATION_PENDING`, `READY_TO_PUBLISH`
- `TRANSLATION_PENDING` -> `TRANSLATION_APPROVED`, `CHANGES_REQUESTED`
- `TRANSLATION_APPROVED` -> `READY_TO_PUBLISH`, `PUBLISHED_MANUALLY`
- `READY_TO_PUBLISH` -> `PUBLISHED_MANUALLY`
- `PUBLISHED_MANUALLY` -> no next state

## Current Transition Rules

- Content approvals and translation approvals are explicit checkpoint decisions.
- Design handoffs are separate from approval checkpoints.
- A failed design attempt can only restart from `DESIGN_FAILED`.
- Provider sync can keep a design request in progress, mark it ready, or mark it failed.
- Manual publish fallback is tracked as a final workflow state for this phase.

## Design Principle

This workflow contract should stay easy to update later. Future changes should extend the rules through the workflow layer, not by coupling the UI or external adapters directly to business decisions.

