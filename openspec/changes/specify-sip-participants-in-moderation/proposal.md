# Proposal

## Why

Meet treats every participant that is not a standard one as a recorder or an agent: not listed, not kickable, not mutable. A phone caller (SIP) or a future voice agent meant to be visible would be missing from the participants list and out of reach of moderators. Nothing in the Community edition connects phone callers today, so this is a decision to take before they exist.

## What Changes

Depending on the decision below:

- Option A: only recorders and agents are hidden; SIP participants are listed, kickable and mutable like any other.
- Option B: keep "only standard participants count" and decide when SIP lands.
- The delta spec (`meetings` "Participants that did not join through Meet", `meeting-moderation` "Kick a participant") is written once the decision is taken.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`) until the decision is taken.

## Impact

- REST API: `participantList`, `participantGet`, `participantKick`, `participantMute` (option A changes which participants they see).
- Webhooks and embedded API: `participantJoined` and `participantLeft` follow the same filter (option A).
- Meeting UI, console UI, deployment configuration: not affected today.
- Code: `getStandardParticipant` of `meeting.service.ts` and `isStandardParticipant` of `livekit.service.ts` in `meet-ce/backend` (option A).
- openvidu.io: moderation page, after the decision.

## Decisions to confirm

- Open product question. Option A: hide an explicit list of kinds (egress, agent) so SIP stays visible. Option B: keep the filter on the standard kind only and leave SIP for the change that introduces it.

## Source

3.10.0 pre-release audit, finding MT-5 (low, static-high; open product question 8), introduced by #133.
