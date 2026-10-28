# Tasks

## 1. Chat state per meeting

- [x] 1.1 Give the chat service a `clear()` that empties the message list and dismisses its pending new-message notice, and call it synchronously at the start of the meeting view teardown (before its first `await`, since Angular does not await `ngOnDestroy` and a remount can overlap it, and the next toolbar must not count the old messages as unread); verify with a Karma spec of the chat service that `clear()` leaves `chatMessages()` empty.
- [x] 1.2 ~~Add to `meet-ce/frontend/e2e/chat.test.ts` a test that exchanges messages, leaves, enters a meeting again in the same tab and checks that the chat panel is empty and the chat button shows no unread count.~~ Dropped: the standalone app has no way back into a meeting without loading the page again (leaving replaces the meeting's history entry with `/disconnected`, and the console opens rooms in a new tab), so every entry starts a fresh app and the bug never showed there.
- [x] 1.3 Add to `meet-ce/frontend/webcomponent/tests/e2e/room.test.ts` the same check for a second meeting entered with the same `<openvidu-meet>` element; report the Playwright suites as not run if the local deployment is unavailable. Run locally: passes, and without the fix it fails on an unread count of 1.

## 2. Release surfaces

- [x] 2.1 Add under `## 3.10.0 (unreleased)` -> `### Fixed` -> `#### UI` of `CHANGELOG.md`: "- After leaving a meeting, joining another meeting with the same `<openvidu-meet>` element showed the earlier meeting's chat messages and counted them as unread. The chat now starts empty in every meeting."
- [x] 2.2 openvidu.io: none.
