# Design Orchestration Boundary

This module owns the full design execution lifecycle: from readiness gating
through provider execution to asset storage and human approval.

## Domain files (no external dependencies)

| File | Purpose |
|------|---------|
| `design-workflow-contract.ts` | State meanings, valid transitions, prerequisites, failure kinds |
| `design-input-contract.ts`   | Typed minimum data payload; factory to build it from a ContentItem |
| `design-provider.ts`         | DesignExecutionProvider interface; DesignProviderExecutionContext |
| `design-readiness-gate.ts`   | Pure gate functions: canTriggerDesignFromStatus, isReadyForDesign |
| `design-eligibility.ts`      | Operator-visible derived status: evaluateDesignEligibility, isRetryExhausted |
| `canva-slice.ts`             | Canva-specific profile/template routing constants (phase-1 only) |

## Infrastructure files (provider implementations)

| File | Purpose |
|------|---------|
| `mock-design-provider.ts`      | Scenario-driven mock; providerMode="MOCK" |
| `design-provider-registry.ts`  | Resolves which provider to return; plug-in point for real adapters |
| `fake-canva-provider.ts`       | **Deprecated** — re-exports mockDesignProvider under the old name |
| `canva-client.ts`              | Reserved for future real Canva API client |

## Adapter boundary

Providers satisfy `DesignExecutionProvider` (domain/design-provider.ts).
They receive a `DesignProviderExecutionContext` (= `DesignInputContract` + `scenario`).
They return `SubmittedDesignRequest` and `SyncedDesignRequest`.

To add Canva:
  1. Implement DesignExecutionProvider in `infrastructure/canva-provider.ts`
  2. Add `case DesignProvider.CANVA: return new CanvaProvider()` in the registry

To add Nano Banana:
  1. Implement DesignExecutionProvider in `infrastructure/nano-banana-provider.ts`
  2. Add `case DesignProvider.AI_VISUAL: return new NanaBananaProvider()` in the registry

No other files need to change.

## Design states (canonical)

```
READY_FOR_DESIGN → IN_DESIGN → DESIGN_READY → DESIGN_APPROVED
                       ↓
                  DESIGN_FAILED → (retry) → IN_DESIGN
```

Legacy aliases: DESIGN_REQUESTED ≈ IN_DESIGN, DESIGN_IN_PROGRESS ≈ IN_DESIGN

See `design-workflow-contract.ts` for full state definitions and prerequisites.
