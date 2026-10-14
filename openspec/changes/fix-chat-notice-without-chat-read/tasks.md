# Tasks

## 1. Chat follows chatRead and chat.enabled

- [ ] 1.1 Make the chat service drop a received message, with no notice, sound or stored entry, while the chat panel button is hidden by the meeting's UI config (the value the meeting derives from `chat.enabled` and `chatRead`); verify with a Karma spec of the chat service that a message received with the button hidden leaves `chatMessages()` empty and shows no notification.
- [ ] 1.2 Add to `meet-ce/frontend/e2e/permissions.test.ts` a test where a participant with `chatRead` false and `chatWrite` true receives a message and sees no notice and no chat button; and to `meet-ce/frontend/e2e/room-features.test.ts` the same for a room with `chat.enabled` false. Report the Playwright suites as not run if the local deployment is unavailable.
- [ ] 1.3 Add to `meet-ce/frontend/e2e/permissions.test.ts` a test that grants `chatRead` to a participant mid-meeting and checks that a message sent after the grant raises the notice and shows in the panel.

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "- A participant without `chatRead`, or in a room with `chat.enabled` set to `false`, got the new-message notice, its sound and an unread count for every chat message. They now get nothing for messages they cannot read."
- [ ] 2.2 openvidu.io: none.
