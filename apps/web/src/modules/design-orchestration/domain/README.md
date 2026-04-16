# Design Orchestration Boundary

Canva is the first real design provider path for phase 1.

The adapter implementation should stay outside the workflow core so that future AI-generated
visual paths can be added without leaking provider-specific behavior into the domain model.
