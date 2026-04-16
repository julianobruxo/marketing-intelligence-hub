# Design Simulation Mode

The first Canva execution slice is now wired through a fake provider by default so the product can
exercise a realistic design workflow before any real provider credentials are introduced.

## Supported scenarios

- `SUCCESS`
  The request is accepted and resolves to `DESIGN_READY` on the first status refresh.
- `DELAYED_SUCCESS`
  The request is accepted, remains in `DESIGN_IN_PROGRESS` on the first refresh, and resolves to
  `DESIGN_READY` on a later refresh.
- `FAILURE`
  The request is accepted and then resolves to `DESIGN_FAILED` with a structured provider error.
- `MALFORMED_RESPONSE`
  The request is accepted and then returns an invalid provider payload so malformed-response handling
  can be exercised explicitly.

## What stays real

- the adapter boundary
- request creation
- duplicate-trigger protection
- persisted design attempts
- timeline visibility
- retry behavior
- content-item linkage
- asset linkage on ready state

## What stays deferred

- live Canva credentials
- final provider environment configuration
- production execution against external APIs
