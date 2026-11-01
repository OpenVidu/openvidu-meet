# Tasks

## 1. Chat delivery that honors chatRead when encrypted

- [ ] 1.1 In `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/chat/chat.service.ts`, send with `localParticipant.sendText(text, { topic: 'chat', destinationIdentities })` and receive with `registerTextStreamHandler('chat', ...)`, removing the data-packet path (and its listener) it replaces. Verified in `chat.service.spec.ts`: recipients are the participants holding `chatRead`, messages keep their order, and incoming text streams show the sender's name.
- [ ] 1.2 Search the workspace for other users of the `chat` data topic (`publishData`, `DataReceived`) and move them to the stream; there must be exactly one handler for the topic.
- [ ] 1.3 e2e: in `meet-ce/frontend/e2e/e2ee.test.ts` (or `chat.test.ts`), an encrypted room with the speaker role denying `chatRead`: the moderator's message is seen in clear by a participant holding `chatRead` and never reaches the speaker. Needs the OpenVidu local deployment; report as not run when unavailable.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: no new line. It makes the existing 3.10.0 line on `chatRead` delivery true in encrypted rooms; check that its wording does not restrict itself to plain rooms.
- [ ] 2.2 openvidu.io: none.
