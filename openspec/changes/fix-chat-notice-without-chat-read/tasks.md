# Tasks

## 1. Chat follows chatRead and chat.enabled

- [x] 1.1 Make the chat service drop a received message, with no notice, sound or stored entry, while the chat panel button is hidden by the meeting's UI config (the value the meeting derives from `chat.enabled` and `chatRead`); verify with a Karma spec of the chat service that a message received with the button hidden leaves `chatMessages()` empty and shows no notification.
- [x] 1.2 Add to `meet-ce/frontend/e2e/permissions.test.ts` a test where a participant with `chatRead` false and `chatWrite` true receives a message and sees no notice and no chat button; a room with `chat.enabled` false needs no new test: since `fix-enforce-chat-enabled-in-media-grant` nobody in it can publish a message, and `room-features.test.ts` already checks it has no chat button. Report the Playwright suites as not run if the local deployment is unavailable.
- [x] 1.3 Add to `meet-ce/frontend/e2e/permissions.test.ts` a test that grants `chatRead` to a participant mid-meeting and checks that a message sent after the grant raises the notice and shows in the panel.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Since `fix-enforce-chat-read-delivery` and `fix-enforce-chat-enabled-in-media-grant`, listed in the same release, those messages no longer reach the participant, so the notice they raised is already gone for every reader of the changelog (USER 2026-10-28).
- [x] 2.2 openvidu.io: none.
