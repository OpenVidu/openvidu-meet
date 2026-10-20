# Tasks

## 1. Address chat messages to chatRead holders

- [x] 1.1 In `chat.service.ts` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/openvidu-components/services/chat/`), compute the identities of the remote participants whose metadata grants `chatRead` and publish the message with them as `destinationIdentities`, skipping the publish when there is none; verify `./meet.sh lint-frontend` and `./meet.sh test-unit-frontend` pass (the behavior is covered by 1.2; the chat service has no spec file of its own and none is added for this fix).
- [x] 1.2 Add to `meet-ce/frontend/e2e/chat.test.ts` a meeting with an identified guest whose `chatRead` is denied: a message sent by another participant receives no data channel packet carrying it (recorded from the page's `RTCPeerConnection` data channels, as a client that bypasses the interface would read them), while a participant holding `chatRead` receives it; run `./meet.sh test-e2e-frontend` (needs the local deployment; report it as not run otherwise).

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### Integration` of `CHANGELOG.md`: "`chatRead` was enforced in the interface only: every chat message reached every participant's client. Messages now reach only the participants holding `chatRead`."
- [x] 2.2 openvidu.io: none.
