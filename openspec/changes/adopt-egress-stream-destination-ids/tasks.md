# Tasks

Backend paths are relative to `meet-ce/backend/`.

## 1. Preconditions

- [x] 1.1 `openvidu/openvidu-server:main` passes `destinations` on; verified on 2026-11-17 by the spike of `design.md` against the published image (LiveKit 1.13.11).
- [x] 1.2 `openvidu/egress:main` carries livekit/egress#1462; verified on 2026-11-17 by the same spike.
- [x] 1.3 Probe a destination streamed to again in the same egress after its stream was removed, with a new id and the same URL; verified by the spike: accepted.

## 2. Backend reads and sends stream ids

- [ ] 2.0 Wait for a `livekit-server-sdk` release with livekit/node-sdks#769 and #772, bump it in `meet-ce` and `meet-pro` to the same version, delete the `@livekit/protocol` override and the declared dependency, and call `EgressClient.updateStream(egressId, [], remove, destinations)` from `LiveKitService.updateStream` instead of the private transport; verified by the unit and integration suites below passing again.

- [x] 2.1 Resolve `@livekit/protocol` 1.53.1 for `livekit-server-sdk` (`pnpm-workspace.yaml` override) and declare it in the backend's `package.json`; verified by a single `@livekit/protocol` 1.53.1 under `node_modules/` besides the one of `livekit-client`.
- [x] 2.2 Send `destinations: [{ id: broadcastId, url }]` in `BroadcastService.startEgress` and let `LiveKitService.updateStream` add destinations, so a broadcast that joins a running egress sends the same pair; verified by the unit tests of `broadcast.service` and `livekit.service`.
- [x] 2.3 In `BroadcastHelper`, delete the tag (`STREAM_TAG`, `taggedUrl`), find a broadcast's stream by `StreamInfo.id`, make stop and withdraw send `destination.url`, and rename `errorEgressWithoutStreamTags` to name stream ids; verified by the unit tests of `broadcast.helper` and no `ov-stream-tag` left under `src/` and `tests/`.
- [x] 2.4 Update the paragraph of `meet-ce/backend/CLAUDE.md` that describes the tag to describe the id; verified by `grep -n "ov-stream-tag" meet-ce/backend/CLAUDE.md` returning nothing.
- [x] 2.5 Run the integration suites `broadcasts`, `broadcast-room-config`, `meeting-security` and `webhook` against a stack with the published server and egress images; verified on 2026-11-17: 105 tests pass.
- [ ] 2.6 Run the pull request's CI; verified by `All tests passed`, including the broadcast Playwright suites.

## 3. Release surfaces

- [x] 3.1 `CHANGELOG.md`: the 3.10.0 Deployment line about the tag says that broadcasts need an egress service that reports stream ids; verified by the line matching `.claude/rules/changelog.md`.
- [x] 3.2 openvidu.io: no page names the tag, so none changes; verified by `grep -rniE "stream tag|ov-stream-tag" docs/meet` in `../openvidu.io` returning nothing on `next`.

## Workflow follow-up

- Archive the change inside the pull request that implements it, once every task is done, and run
  `./meet.sh verify --only openspec --all` afterwards.
- After the pull request merges, outside this repository: remove OpenVidu/egress#5 from the branch OpenVidu ships
  (the `OPENVIDU BLOCK`s and `splitStreamTag` of `pkg/config/urls.go`, `TestStreamTag` in
  `pkg/config/urls_test.go`, the 3.10.0 entry of `CHANGELOG-openvidu.md`) and publish `openvidu/egress:main`. It
  is a manual removal: `git revert` of the commit conflicts with livekit/egress#1462 in the three files.
- When a `livekit-server-sdk` release carries livekit/node-sdks#772: bump it in `meet-ce` and `meet-pro`, delete
  the `@livekit/protocol` override and call `EgressClient.updateStream` again. No spec changes with it.
