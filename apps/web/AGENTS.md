<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This app uses Next.js 16.
APIs, conventions, and file structure may differ from older training data.

Before writing or changing framework-sensitive code:
- inspect the current project files first
- verify the actual patterns already used in this app
- check relevant current docs when needed
- heed deprecation notices

Do not assume older Next.js conventions are correct.
<!-- END:nextjs-agent-rules -->

# App-Level Agent Rules for `apps/web`

This file defines local rules for the web app.
Global engineering rules live in the repository root `CLAUDE.md`.
If there is any conflict, follow the stricter rule.

## App Reality

This app is built with:
- Next.js 16
- React 19
- TypeScript 5
- Prisma 7
- Postgres
- Zod
- Radix UI
- shadcn
- Tailwind CSS 4
- Vitest

## Scripts You Must Respect

Use the real scripts defined in `apps/web/package.json`.

Available scripts:
- `npm run dev`
- `npm run dev:next`
- `npm run build`
- `npm run start`
- `npm run start:prod`
- `npm run lint`
- `npm run test`
- `npm run test:watch`
- `npm run db:generate`
- `npm run db:migrate`
- `npm run db:push`
- `npm run db:seed`
- `npm run checkpoint:persistence`

Do not invent commands.
Do not claim to have run commands that were not run.

## Local DB / Dev Rules

For local development:
- prefer the documented local setup flow
- do not default to `db:migrate` for normal local dev
- use `db push` for local dev when the documented flow requires it

Treat database scripts, seed behavior, and env alignment as high-risk operations.

## Workflow Truth Matters

This app has an explicit workflow contract for phase 1.

Core states include:
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

Do not:
- bypass workflow transitions casually
- collapse distinct states into convenience shortcuts
- change status semantics without explicit request
- let UI convenience override workflow truth

If workflow truth and current UI behavior conflict, preserve workflow truth.

## Shared UI Rules

This app already contains shared UI primitives.
Before creating any new primitive or status mapping, inspect and reuse existing shared UI:

- `src/shared/ui/status-badge.tsx`
- `src/shared/ui/workflow-stepper.tsx`
- `src/shared/ui/design-tokens.ts`

Do not duplicate:
- badge systems
- workflow display systems
- token maps
- status color semantics

Extend safely instead of forking patterns.

## Safe Change Policy

When changing this app:
1. inspect the local files first
2. identify the smallest safe fix
3. avoid broad refactors
4. preserve current architecture
5. validate the affected surface

Prefer:
- minimal diffs
- explicit logic
- strong typing
- predictable UI behavior
- reuse of existing primitives

Avoid:
- speculative cleanup
- drive-by refactors
- hidden side effects
- unnecessary dependency changes
- weak typing
- silent business logic changes

## Validation Expectations

For meaningful changes, run the relevant subset of:
- `npm run lint`
- `npm run test`
- `npm run build`

If the change touches DB or persistence logic, also validate the relevant database path safely.

When reporting back:
- list files touched
- state root cause or reason for implementation
- state what was validated
- state what was not validated
- state any remaining risk

## Response Style for This App

Be surgical and exact.

Default response structure:
- Objective
- Findings
- Plan
- Changes Made
- Validation
- Risks / Notes

Do not pad.
Do not oversell.
Do not fake certainty.
Do not pretend a partial fix is complete.