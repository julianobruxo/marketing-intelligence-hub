# State Model Evolution Note

Phase 1 is intentionally still running on a single top-level `currentStatus` so the product can
stay stable while the workflow foundation matures.

## Current limits

- one field is carrying editorial review, design progress, translation progress, and publish
  readiness at the same time
- parallel checkpoints are visible in approvals and design records, but not represented explicitly
  in the primary state model
- status transitions become harder to reason about once two tracks can be true at once, such as:
  publish approved while translation is still pending

## When it becomes too overloaded

The current approach becomes too overloaded when the product needs to support any of these safely:

- independent publish and translation progression
- multiple active downstream tracks on the same content item
- clearer publish packaging and manual posting states
- automated handoffs that depend on one checkpoint but not another
- richer queue filtering by functional area instead of one blended state

## Recommended future split

When phase 1 foundations are stable, evolve toward separate fields such as:

- `workflowStatus`
- `designStatus`
- `translationStatus`
- `publishStatus`

The existing `currentStatus` can then be retained temporarily as a derived summary or compatibility
field while the UI and actions are migrated incrementally.

## Safe migration path

1. Add the new fields alongside `currentStatus` without removing existing behavior.
2. Backfill them from current records, approvals, design attempts, and assets.
3. Update queue and detail view models to read the new fields first.
4. Update server actions to write both the old and new representations during the transition.
5. Once the product is stable on the split model, retire `currentStatus` or reduce it to a derived
   presentation field.
