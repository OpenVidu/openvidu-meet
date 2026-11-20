# Tasks

Backend paths are relative to `meet-ce/backend/`. Groups 1 and 3 hold work outside the Meet code, which
gates group 2: nothing in group 2 starts before 1.1 and 1.2 are done.

## 1. Preconditions

- [ ] 1.1 Wait for a `livekit-server-sdk` release that carries `@livekit/protocol` 1.53.1 or later and lets `EgressClient.updateStream` add destinations (livekit/node-sdks#769 bumps the protocol, #772 adds the parameter), then bump `livekit-server-sdk` in `package.json` of the backend and in `meet-pro` to the same version; verified by `npm view livekit-server-sdk version` above 2.19.2, `addDestinations` present in the installed `dist/EgressClient.d.ts` and the backend building.
- [ ] 1.2 Sync `OpenVidu/openvidu-livekit` to a protocol with the destination fields (1.53.1 or later, with psrpc 0.8, whose only code change in the server is the Redis message bus constructor) and publish `openvidu-server:main`; verified by a start with `destinations` against the local deployment returning each stream's `id` in `streamResults`.
- [x] 1.3 OpenVidu egress with livekit/egress#1462 published; done on 2026-11-03: `openvidu/egress:main` reports egress 1.15.0 and its binary carries `StreamDestination`.
- [ ] 1.4 Probe against the local deployment of 1.1 and 1.2, with a Node script from the SDK of 1.1, and write the outcomes into the Risks of `design.md`: (a) a destination streamed to again in the same egress after its stream was removed, with a new id and the same URL; (b) the response of `broadcastStart` to an egress that reports no id and to a server that drops `destinations`; verified by both outcomes recorded, and by (a) either passing or the design amended with how the restart avoids it.

## 2. Backend reads and sends stream ids

- [ ] 2.1 Send `destinations: [{ id: broadcastId, url }]` in `BroadcastService.startEgress` and let `LivekitService.updateStream` add destinations, so a broadcast that joins a running egress sends the same pair; verified by unit tests of `broadcast.service` that assert the id and the plain URL in both requests.
- [ ] 2.2 In `BroadcastHelper`, delete the tag (`STREAM_TAG`, `taggedUrl`), find a broadcast's stream by `StreamInfo.id`, make stop and withdraw send `destination.url`, and rename `errorEgressWithoutStreamTags` to name stream ids; verified by unit tests of `broadcast.helper` (a stream found by id whatever the order or redaction, `500` when no stream carries the id) and no remaining `ov-stream-tag` under `src/` and `tests/`.
- [ ] 2.3 Update the paragraph of `meet-ce/backend/CLAUDE.md` that describes the tag to describe the id; verified by `grep -n "ov-stream-tag" meet-ce/backend/CLAUDE.md` returning nothing.
- [ ] 2.4 Run the integration tests `broadcasts`, `broadcast-room-config` and `meeting-security` against the stack of 1.2 and 3.1, with the scenario of 1.4 (a) added to `broadcasts` as a test when it holds; verified by those suites passing (reported as not run if the stack is not available).

## 3. Revert the egress patch

- [ ] 3.1 In the OpenVidu/egress branch OpenVidu ships, revert OpenVidu/egress#5 (the commit "Report the tag a client appends to a stream url" and its Go test in `pkg/config`), and publish `openvidu/egress:main`; verified by `go test ./pkg/config/...` in that branch and by `ov-stream-tag` absent from the published image's binary.
- [ ] 3.2 Run the pull request's CI with the images of 1.2 and 3.1; verified by `All tests passed`, including the broadcast Playwright suites.

## 4. Release surfaces

- [ ] 4.1 `CHANGELOG.md`: in the release that ships this change, say under Deployment that broadcasts need an egress that reports stream ids, replacing the 3.10.0 line about the tag if 3.10.0 is not out yet; verified by the line matching the rules of the root `CLAUDE.md`.
- [ ] 4.2 openvidu.io: no page names the tag, so none changes; verified by `grep -rniE "stream tag|ov-stream-tag" docs/meet` in `../openvidu.io` returning nothing on `next`.

## Workflow follow-up

- Archive the change inside the pull request that implements it, once every task is done, and run
  `npx openspec validate --all --strict` afterwards.
