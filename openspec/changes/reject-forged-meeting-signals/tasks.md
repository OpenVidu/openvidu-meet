# Tasks

## 1. Server-only signal guard (frontend)

- [ ] 1.1 In `MeetingEventsService.subscribeToDataMessage`, read the `encryptionType` and `participantIdentity` arguments of `RoomEvent.DataReceived` and discard every packet on a `MeetSignalType` topic unless `participantIdentity` is empty and `encryptionType` is `Encryption_Type.NONE` (a missing value counts as encrypted), logging the stamped identity; leave the chat path unchanged (design D1, D2); verify `./meet.sh lint-frontend` passes.
- [ ] 1.2 Extend `meeting-events.service.spec.ts` (the existing "data message sender" block) so the test room passes the two extra arguments, and cover: a server signal (no identity, `NONE`) is applied and relayed; a signal stamped with a listed participant's identity is ignored; a signal stamped with an identity the receiver does not list is ignored; an encrypted signal with a stamped identity is ignored; an encrypted signal without identity is ignored; a missing `encryptionType` is ignored; verify `./meet.sh test-unit-frontend` passes.

## 2. Server signals still arrive as the server's (verification)

- [ ] 2.1 Extend `meet-ce/frontend/e2e/e2ee.test.ts` with a room with end-to-end encryption where a moderator starts the recording and mutes a speaker's microphone, and both participants see the recording indicator and the speaker's microphone turns off, proving server signals reach encrypted rooms unencrypted and without a sender identity; run it, with the existing recording and moderation e2e suites for rooms without encryption, against the local deployment (report as not run if the deployment is unavailable).

## 3. Release surfaces

- [ ] 3.1 Add one line to `CHANGELOG.md` under the unreleased 3.10.0, `Fixed` › `UI`: a server meeting signal (recording state, moderator mute, reaction, permission refresh) published by a participant that the receiving meeting did not list yet was taken as the server's; only signals sent by the server apply now; verify it follows the root `CLAUDE.md` changelog rules.
- [ ] 3.2 No openvidu.io page describes how meeting signals are authenticated, so none changes; confirm with a search of `docs/meet` for the signal names before archiving.

## Workflow follow-up

- Archive the change inside the pull request that implements it, once every task is done, and run `npx openspec validate --all --strict` afterwards.
- Topic-scoped data permissions in the OpenVidu LiveKit fork remain an optional, separate change.
