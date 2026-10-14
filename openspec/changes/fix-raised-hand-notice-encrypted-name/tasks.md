# Tasks

## 1. Decrypted name in the notice

- [ ] 1.1 Make the raised-hand notice take the participant's display name from the meeting's participant model (decrypted or masked) instead of the media server's raw name; verify with a Karma case in `meeting-event-handler.service.spec.ts` that a participant whose decrypted name differs from the raw one is announced with the decrypted name.
- [ ] 1.2 Add to `meet-ce/frontend/e2e/e2ee.test.ts` a test where a speaker raises a hand in an encrypted meeting and the moderator's notice shows the speaker's clear name; report it as not run if the local deployment is unavailable.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no line. Raise hand is new in 3.10.0 (listed under `### Added`), so this fix belongs to that entry.
- [ ] 2.2 openvidu.io: none.
