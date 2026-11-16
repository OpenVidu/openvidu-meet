# Tasks

## 1. Live broadcast

- [x] 1.1 S2: `broadcastStart` throws the `422` `errorBroadcastUnknownDestination` for an unknown `destinationIds` entry and `errorBroadcastStartUnknownDestination` goes away; the OpenAPI moves the example to `broadcast-destinations-invalid.yaml` and the `400` back to the shared `malformed-body.yaml`; unit and integration tests updated.
- [x] 1.2 E5: `errorBroadcastStopInProgress` answers "is already being stopped", in the code and in `broadcast-already-stopped.yaml`.
- [x] 1.3 E1: `MeetBroadcastErrorCode` in the typings; the five broadcast `409` constructors answer its codes; `broadcast-conflict.yaml` and `broadcast-already-stopped.yaml` show one example per code, and the shared error schema says `error` may be a code.
- [x] 1.4 E4: `broadcast-not-found.yaml` shows the `room_not_found` example next to the broadcast one.

## 2. Raise hand

- [x] 2.1 B1: `MeetParticipantHandOptions.handRaised`, the zod schemas, the controller, the permission middleware, the meeting's moderation service and both OpenAPI request files; unit and integration tests updated.

## 2b. Names (N1)

- [x] 2b.1 Rename the permissions, commands and operationIds of raise hand and reactions, and `recordingLinkGet`, across typings, backend, OpenAPI, frontend, web component, testapp, tests, translation keys and `CHANGELOG.md` (the 3.10.0 entries of both features).
- [x] 2b.2 Migrations room v10 to v11 and room member v7 to v8: every permission normalization of a stored document first carries `participantHandLower` and `participantReactionSend` over to their new names (`migrations/unreleased-permission-renames.ts`); unit tests for both steps.

## 3. Room config

- [x] 3.1 B2: `BroadcastConfigSchema` requires `enabled`, `MeetBroadcastConfigOptions` types it as required and `MeetBroadcastConfig` in the OpenAPI lists it in `required`; the tests that left the switch out now expect `422`.

## 4. Release surfaces

- [x] 4.1 `CHANGELOG.md`: none; every change touches an unreleased feature.
- [x] 4.2 openvidu.io `next`: regenerate the REST and embedded references, from this change on top of `stop-broadcast-by-id`, and rename the identifiers on the raise hand, reactions and permissions pages.

## Workflow follow-up

- After archive, update the Surfaces lines of the `raise-hand`, `reactions` and `permissions` Purposes with the new names.
