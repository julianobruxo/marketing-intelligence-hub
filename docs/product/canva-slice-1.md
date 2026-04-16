# Canva Slice 1

## Exact scope

- Profile: `YANN`
- Content type: `STATIC_POST`
- Locale: `en`
- Template family: `Yann Static English`
- Dynamic fields only: `TITLE`, `BODY`

## Minimum successful flow

1. User opens an approved `YANN` static post in the content detail view.
2. The app creates a `DesignRequest` and moves the content item to `DESIGN_REQUESTED`.
3. The app validates the active Canva template mapping and the template dataset.
4. The app starts an Autofill job in Canva and moves the content item to `DESIGN_IN_PROGRESS`.
5. The app polls for completion.
6. On success, the app marks the request `READY` and moves the content item to `DESIGN_READY`.
7. Human approval can later move the content item to `DESIGN_APPROVED`.

This slice does **not** include carousel support, multi-template selection, or export job handling.

## Data sent to Canva

- `brand_template_id`
- `TITLE` -> content item title
- `BODY` -> content item copy

## Data expected back from Canva

- autofill job id
- job status
- generated design id
- edit URL
- thumbnail URL

## Persistence after success

- `DesignRequest` with provider `CANVA`, request fingerprint, attempt number, external request id, request payload, and result payload
- `ContentItem.currentStatus = DESIGN_READY`
- `StatusEvent` entries for `DESIGN_REQUESTED`, `DESIGN_IN_PROGRESS`, and `DESIGN_READY`

## Failure behavior

- the `DesignRequest` is marked `FAILED`
- provider error code and message are stored on the request
- failure payload is stored in `resultPayload`
- the content item moves to `DESIGN_FAILED`
- a retry creates a new design-request attempt for the same canonical content item and request fingerprint
