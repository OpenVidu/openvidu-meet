# Tasks

## 1. Webhook room scope wording

- [x] 1.1 Rewrite the `roomId` description of `meet-ce/backend/openapi/webhooks/schemas/meet-webhook-endpoint.yaml` as stated in the proposal, without the em dash; verify that no file under `meet-ce/backend/openapi/webhooks` contains the U+2014 character and `pnpm run lint:api` in `meet-ce/backend` passes. Redocly lint: both APIs valid, no new problem.
- [x] 1.2 Shorten the `roomId` paragraph of the `WebhookRegistryService` class comment to the non-validation constraint, dropping the "before its room is created" claim and the roadmap reference; verify `pnpm run lint` in `meet-ce/backend` passes. ESLint on `webhook-registry.service.ts` passes.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. The change corrects the OpenAPI and a comment to describe behavior the server already had (root `CLAUDE.md`, Changelog).
- [x] 2.2 Regenerate the openvidu.io REST API reference on `next` with `./meet.sh build-rest-api-doc ../openvidu.io/docs/meet/embedded/reference/api.html` and verify the `MeetWebhookEndpoint.roomId` text in the generated page. Regenerated from `feat/live-broadcast` at the commit last published on `next` (bd30724e6) plus these edits, because the page on `next` already carries the live broadcast API, which `main` does not have yet; the diff against the published page holds only this batch of wording changes.
