# Marketing Intelligence Hub

An internal content operations platform for **Zazmic** that automates the LinkedIn post production pipeline — from Google Sheets to published post.

---

## What it does

The hub manages the end-to-end lifecycle of LinkedIn content: intake from planning spreadsheets, review, AI-powered design generation, optional translation, and LinkedIn publishing — with a full audit trail at every step.

```
Google Sheets → Import → Review → Design → Translation → LinkedIn Post
```

Each piece of content moves through a tracked workflow with role-based approvals, operator actions, and status events recorded in PostgreSQL.

---

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) + React 19 |
| Language | TypeScript 5 |
| Database | PostgreSQL via Prisma 7 |
| Auth | Google OAuth 2.0 (JWT-based session cookies) |
| UI | Radix UI + shadcn/ui + Tailwind CSS 4 |
| Validation | Zod |
| Testing | Vitest (unit + integration) |
| AI Providers | OpenAI (GPT Image), Google Gemini (Nano Banana) |
| Design | Canva Connect API |

---

## Repository structure

```
marketing-intelligence-hub/
├── apps/
│   └── web/                    # Primary Next.js application
│       ├── prisma/             # Schema, migrations, seed
│       ├── public/             # Static assets
│       ├── scripts/            # Dev and maintenance scripts
│       └── src/
│           ├── app/            # Next.js App Router pages + API routes
│           │   ├── (protected)/
│           │   │   ├── import/ # Spreadsheet import wizard
│           │   │   ├── queue/  # Content queue + item detail pages
│           │   │   └── settings/
│           │   └── api/        # REST + server action API routes
│           ├── modules/        # Domain modules (see below)
│           └── shared/         # Shared UI, lib, config, logging
├── docs/                       # ADRs and product documentation
├── CLAUDE.md                   # Engineering guidelines for AI agents
└── LOCAL_DEV_SETUP.md          # Local development quickstart
```

---

## Domain modules

| Module | Responsibility |
|---|---|
| `auth` | Google OAuth login, session cookies, role checks |
| `content-intake` | Google Sheets → content item ingestion, normalization, Drive-first import |
| `content-catalog` | Queue queries, workflow view models, content detail |
| `design-orchestration` | Canva, GPT Image, Nano Banana design requests + variation approval |
| `linkedin` | LinkedIn target resolution, copy/asset resolution, mock publisher |
| `translation` | PT-BR and French translation workflow, per-language approval |
| `workflow` | Status transitions, approval records, workflow notes |
| `profiles-and-templates` | Profile-to-template mappings per design provider |

---

## Content workflow

Items move through a tracked status machine:

```
BLOCKED / WAITING_FOR_COPY
    │ (copy added, reimport)
    ▼
READY_FOR_DESIGN
    │
    ▼ (design initiated)
IN_DESIGN ──► DESIGN_FAILED ──► (retry)
    │
    ▼ (provider complete)
DESIGN_READY
    │ (operator selects variation + approves)
    ▼
DESIGN_APPROVED
    │
    ├──► TRANSLATION_REQUESTED ──► TRANSLATION_READY ──► TRANSLATION_APPROVED
    │                                                           │
    │◄──────────────────────────────── skip translation ───────┘
    ▼
READY_FOR_FINAL_REVIEW
    │
    ▼
READY_TO_POST
    │
    ▼
POSTED
```

Every transition is recorded as a `StatusEvent` with actor email and timestamp.

---

## Design providers

| Provider | Mode | Notes |
|---|---|---|
| **GPT Image 2** | `MOCK` / `REAL` | OpenAI image generation, synchronous |
| **Nano Banana 2** | `MOCK` / `REAL` | Google Gemini image generation, synchronous |
| **Canva** | `MOCK` / `REAL` | Template-based, Canva Connect API |
| **Manual** | — | Operator uploads asset manually |

Provider mode is controlled per-provider via environment variables (`GPT_IMAGE_PROVIDER_MODE`, `NB_PROVIDER_MODE`, `CANVA_PROVIDER_MODE`). Operators can generate multiple variations and select one before approving.

---

## Import pipeline

Content is ingested from Google Sheets via a **Drive-first import wizard**:

1. Operator selects a Google Drive spreadsheet.
2. The system fetches sheets, runs AI sheet analysis to detect the profile and column layout.
3. Rows are normalized against a sheet profile contract.
4. Each qualified row becomes (or updates) a `ContentItem` in the queue.
5. `reimportStrategy` controls whether reimports `UPDATE` (preserve workflow state) or `REPLACE` (reset to initial status).

Items blocked due to missing copy are automatically advanced to `READY_FOR_DESIGN` when copy is added and the item is reimported.

---

## Roles

| Role | Permissions |
|---|---|
| `ADMIN` | Full access |
| `EDITOR` | Import, design, notes |
| `APPROVER` | Content + final approval |
| `TRANSLATION_APPROVER` | Translation approval |

---

## Local development

### Prerequisites

- Node.js 20+
- Docker Desktop

### Setup

```bash
# 1. Start the database
docker run -d --name mhub-db \
  -e POSTGRES_USER=postgres \
  -e POSTGRES_PASSWORD=postgres \
  -e POSTGRES_DB=marketing_hub \
  -p 5432:5432 \
  --restart unless-stopped \
  postgres:15

# 2. Install dependencies
npm install

# 3. Push schema and seed
npm run db:push
npm run db:seed

# 4. Start dev server
npm run dev
```

App runs at [http://localhost:3000](http://localhost:3000).

> **Important:** Use `npm run db:push` for local development. Do not use `npm run db:migrate` during normal local dev.

### Environment variables

Create `apps/web/.env` with the following (values shown are examples):

```env
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/marketing_hub

# Google OAuth
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=http://localhost:3000/api/auth/google/callback

# Session
SESSION_SECRET=...

# Design providers
CANVA_PROVIDER_MODE=MOCK
GPT_IMAGE_PROVIDER_MODE=MOCK
NB_PROVIDER_MODE=MOCK
OPENAI_API_KEY=...
NB_API_KEY=...
NB_MODEL=gemini-3-pro-image-preview
```

---

## Commands

### Root (monorepo)

```bash
npm run dev          # Start dev server
npm run build        # Build for production
npm run lint         # Lint
npm run db:push      # Push schema to DB (local dev)
npm run db:generate  # Regenerate Prisma client
npm run db:seed      # Seed the database
```

### `apps/web`

```bash
npm run test         # Run unit/integration tests (Vitest)
npm run test:watch   # Watch mode
npm run db:studio    # Prisma Studio
```

---

## Testing

```bash
cd apps/web
npm run test
```

309 tests across unit, domain logic, and import pipeline regression suites.

Key test areas:
- Import normalization + business rules (84 regression tests)
- Spreadsheet variant fixtures (61 fixture-level tests)
- Design initiation validation
- Workflow status transitions
- Nano Banana variation extraction

---

## Key API routes

| Route | Purpose |
|---|---|
| `POST /api/ingestion/content-items` | Ingest a normalized content item from an orchestrator |
| `POST /api/ingestion/sheets/normalize` | Normalize a raw sheet row against a profile |
| `GET /api/import/[batchId]/rows` | Diagnostic: list all rows for an import batch |
| `GET /api/health` | Health check |
| `GET /api/auth/google/login` | Initiate Google OAuth |
| `GET /api/auth/google/callback` | OAuth callback |
| `GET /api/design-orchestration/nano-banana/results/[requestId]/[variationId]` | Serve generated NB image |

---

## Architecture notes

- **Server Components first.** Pages are React Server Components fetching data directly from the database. Client components are used only for interactive UI (modals, transitions, form state).
- **Server Actions** handle all mutations (workflow transitions, design requests, approvals). No separate REST API layer for operator actions.
- **Soft deletes** on most entities via `deletedAt`.
- **Idempotent ingestion.** Each import payload carries an `idempotencyKey`; duplicate receipts are detected before processing.
- **Design result payload.** Generated image variations (including base64 data URLs) are persisted in `DesignRequest.resultPayload` so they survive server restarts and in-memory TTL expiry.
- **Workflow transitions** are explicitly asserted via `assertContentStatusTransition` — invalid jumps throw at the application layer before any DB write.
