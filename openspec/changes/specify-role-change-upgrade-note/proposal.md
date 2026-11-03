# Proposal

## Why

Release 3.10 removes the signal that told a 3.9 browser tab to renew its token after a promotion or demotion. A tab opened with 3.9 that stays in a meeting while Meet is upgraded (the media server keeps the meeting alive) receives no trigger: a promoted participant gets no moderator controls until they reload or the token renews on its own (up to about two hours), and a demoted one keeps controls whose actions are refused. The server enforces permissions, so this is not a security issue.

## What Changes

- Depending on the decision below: an Upgrade notes line telling that participants in a meeting during the upgrade reload to see role changes, or keeping the old signal until 3.12.0.
- No spec change unless option B is chosen (then the signal is a deprecated name kept until 3.12.0).

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`).

## Impact

- Meeting UI: only for 3.9 tabs that stay through the upgrade.
- Embedded API: not affected; webhooks: not affected.
- Code (option B only): the frontend signal typings and the notice sent after a role change in `meet-ce/backend`.
- openvidu.io: none.

## Decisions to confirm

- Open product question 10. Option A: add an Upgrade notes line to the 3.10.0 changelog (participants in a meeting during the upgrade reload to see role changes). Option B: keep sending the old signal until 3.12.0, like the other deprecated names.

## Source

3.10.0 pre-release audit, finding TK-5 (low, static-high), introduced by #103.
