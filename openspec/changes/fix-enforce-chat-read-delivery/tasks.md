# Tasks

## 1. Address chat messages to chatRead holders

- [ ] 1.1 In `chat.service.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/chat/`), compute the identities of the remote participants whose metadata grants `chatRead` and publish the message with them as `destinationIdentities`, skipping the publish when there is none; verify `./meet.sh lint-frontend` and `./meet.sh test-unit-frontend` pass (the behavior is covered by 1.2; the chat service has no spec file of its own and none is added for this fix).
- [ ] 1.2 Add to `meet-ce/frontend/e2e/chat.test.ts` a meeting with an identified guest whose `chatRead` is denied: a message sent by another participant raises no `DataReceived` event with topic `chat` in the guest's page (listened to through the page's LiveKit room), while a participant holding `chatRead` receives it; run `./meet.sh test-e2e-frontend` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [ ] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "`chatRead` was enforced in the interface only: every chat message reached every participant's client. Messages now reach only the participants holding `chatRead`."
- [ ] 2.2 openvidu.io: none.
