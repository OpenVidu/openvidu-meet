# Proposal

## Why

`participantKick` removes any identity present in the media server's room, including the recorder of a recording in progress and agents such as the live captions assistant. Kicking the recorder breaks the recording and kicking the assistant breaks captions for everyone, while `participantGet`, `participantList` and `participantMute` already treat those participants as not being in the meeting and answer 404 for them.

## What Changes

- `participantKick` answers 404 for a recorder or an agent, as it does for an identity that is not in the meeting, and removes nothing. The embedded command `participantKick` (and `kickParticipant`) is rejected the same way, since it goes through the same operation.
- Member and user removals that kick their participant are unaffected: their identities are never recorders or agents.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-moderation`: the requirement "Kick a participant" states that recorders and agents are answered as not in the meeting.

## Impact

- REST API: `participantKick` answers 404 instead of 200 for recorders and agents. The documented 404 response already covers "participant not in the meeting"; no schema change.
- Embedded API: `participantKick` and its deprecated alias `kickParticipant` fail for those identities as for an absent one. No contract change.
- Webhooks, meeting UI, console UI, deployment configuration: not affected (the participants panel never lists recorders or agents).
- openvidu.io: no page changes.

## Decisions to confirm

- Recorders and agents answer 404 like an absent participant, consistent with `participantGet` and `participantMute` (alternative: 403 or 409 naming them as protected participants).
