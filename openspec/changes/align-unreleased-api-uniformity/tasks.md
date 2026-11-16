# Tasks

## 1. Live broadcast

- [x] 1.1 S2: `broadcastStart` throws the `422` `errorBroadcastUnknownDestination` for an unknown `destinationIds` entry and `errorBroadcastStartUnknownDestination` goes away; the OpenAPI moves the example to `broadcast-destinations-invalid.yaml` and the `400` back to the shared `malformed-body.yaml`; unit and integration tests updated.
- [x] 1.2 E5: `errorBroadcastStopInProgress` answers "is already being stopped", in the code and in `broadcast-already-stopped.yaml`.
- [x] 1.3 E1: `MeetBroadcastErrorCode` in the typings; the five broadcast `409` constructors answer its codes; `broadcast-conflict.yaml` and `broadcast-already-stopped.yaml` show one example per code, and the shared error schema says `error` may be a code.
- [x] 1.4 E4: `broadcast-not-found.yaml` shows the `room_not_found` example next to the broadcast one.

- [x] 1.5 Documentation findings: `broadcastStart` says why it sends no `Location` (U2), `broadcast-forbidden.yaml` shows the authorization example (E3), `participantUpdateHand` documents its `Hand Error` 403 in `forbidden-hand.yaml` and has its own permission line (E2, D1), `broadcastList` and `participantUpdateHand` get the summaries of their siblings (D1), and the three webhook event enums list the events in one order, grouped by module (N4).

## 2. Raise hand

- [x] 2.1 B1: `MeetParticipantHandOptions.handRaised`, the zod schemas, the controller, the permission middleware, the meeting's moderation service and both OpenAPI request files; unit and integration tests updated.

## 2b. Names (N1)

- [x] 2b.1 Rename the permissions, commands and operationIds of raise hand and reactions, and `recordingLinkGet`, across typings, backend, OpenAPI, frontend, web component, testapp, tests, translation keys and `CHANGELOG.md` (the 3.10.0 entries of both features).
- [x] 2b.2 Migrations room v10 to v11 and room member v7 to v8: every permission normalization of a stored document first carries `participantHandLower` and `participantReactionSend` over to their new names (`migrations/unreleased-permission-renames.ts`); unit tests for both steps.

- [x] 2b.3 Rename every `operationId` to the charter (54), in the OpenAPI, the TSDoc and the 3.10.0 entries of `CHANGELOG.md` with their links; drop the frozen list and the bulk exception from the naming lint; register `user`, `auth`, `config`, `analytics` and `ai`, and remove the unused `hand` and `reaction`; update the charter in `meet-ce/typings/CLAUDE.md` and `meet-ce/backend/openapi/README.md`.

## 3. Room config

- [x] 3.1 B2: `BroadcastConfigSchema` requires `enabled`, `MeetBroadcastConfigOptions` types it as required and `MeetBroadcastConfig` in the OpenAPI lists it in `required`; the tests that left the switch out now expect `422`.

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md`: none; every change touches an unreleased feature.
- [ ] 4.2 openvidu.io `next`: regenerate the REST and embedded references, from this change on top of `stop-broadcast-by-id`, rename the identifiers on the raise hand, reactions and permissions pages, and every `#/operations/<id>` link.

## Workflow follow-up

- After archive, update the Surfaces lines of every Purpose that names a renamed `operationId`, permission or command.
