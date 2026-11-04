# Tasks

## 1. Server-only signal guard (frontend)

- [x] 1.1 In `MeetingEventsService.subscribeToDataMessage`, read the `encryptionType` and `participantIdentity` arguments of `RoomEvent.DataReceived` and discard every packet on a `MeetSignalType` topic unless `participantIdentity` is empty and `encryptionType` is `Encryption_Type.NONE` (a missing value counts as encrypted), logging the stamped identity; leave the chat path unchanged (design D1, D2); verify `./meet.sh lint-frontend` passes.
- [x] 1.2 Extend `meeting-events.service.spec.ts` (the existing "data message sender" block) so the test room passes the two extra arguments, and cover: a server signal (no identity, `NONE`) is applied and relayed; a signal stamped with a listed participant's identity is ignored; a signal stamped with an identity the receiver does not list is ignored; an encrypted signal with a stamped identity is ignored; an encrypted signal without identity is ignored; a missing `encryptionType` is ignored; verify `./meet.sh test-unit-frontend` passes.

## 2. Server signals still arrive as the server's (verification)

- [x] 2.1 Add to `meet-ce/frontend/e2e/e2ee.test.ts` "should apply a moderator mute in an encrypted room": a moderator turns off a speaker's microphone in a room with end-to-end encryption and the speaker's microphone turns off with the moderator notice, proving server signals reach encrypted rooms unencrypted and without a sender identity (recording and live broadcast are turned off in encrypted rooms, so the moderator mute is the server signal an encrypted room has). Ran against the local deployment with an isolated backend: it passes, with the `participantMute`, reaction and permission suites of `participants.test.ts` (28 passed).

## 3. Release surfaces

- [x] 3.1 Add one line to `CHANGELOG.md` under the unreleased 3.10.0, `Fixed` › `UI`: a server meeting signal (recording state, moderator mute, reaction, permission refresh) published by a participant that the receiving meeting did not list yet was taken as the server's; only signals sent by the server apply now; verify it follows the root `CLAUDE.md` changelog rules.
- [x] 3.2 No openvidu.io page describes how meeting signals are authenticated, so none changes; confirm with a search of `docs/meet` for the signal names before archiving.

## Workflow follow-up

- Archive the change inside the pull request that implements it, once every task is done, and run `npx openspec validate --all --strict` afterwards.
- Topic-scoped data permissions in the OpenVidu LiveKit fork remain an optional, separate change.
