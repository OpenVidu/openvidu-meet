# Proposal

## Why

The join screen locks the name of an identified guest, a member user or a signed-in user (see
`meeting-join` "Participant name precedence"), but `generateRoomMemberToken` takes any `participantName` the
request carries over the member's or the user's name. A modified client, or anyone holding a guest's
personal link, joins under a name of their choosing, and the meeting and the `participantJoined` webhook
show it.

## What Changes

- A join token bound to a member or a user takes the member's or the user's name; `participantName` is used
  only when there is neither (anonymous links).
- In a room with end-to-end encryption the `participantName` given is still used, because the client sends
  the name encrypted and the server cannot check it (`meeting-media` "Encrypted names reach the server
  encrypted").

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: "Join tokens" states the server's name precedence, with scenarios for an identified guest,
  a signed-in user, an anonymous participant and an encrypted room.

## Impact

- Internal API: `generateRoomMemberToken` ignores `participantName` when the token is bound to a member or a
  user outside encrypted rooms. Internal contract, no compatibility promise; the internal OpenAPI
  description of `participantName` (`meet-ce/backend/openapi/room-members/internal/schemas/room-member-token-options.yaml`)
  is reworded.
- Webhooks: `participantJoined` and later payloads carry the enforced name. No contract change.
- Meeting UI: none for unmodified clients (the join screen already sends the locked name).
- Embedded API: none; the TSDoc of `participant-name` in `meet-ce/typings/src/embedded/attributes.ts`
  already belongs to another area's fix (it is overridden by the member record or the user's name).
- Console UI, deployment configuration: none.
- Code: `meet-ce/backend/src/services/room-member.service.ts` (`generateRoomMemberToken`).
- openvidu.io: none.

## Decisions to confirm

- The server enforces the name of member users and signed-in users too, not only identified guests,
  matching what the join screen locks. Alternative: enforce only the identified guest's name.
- Encrypted rooms keep using the `participantName` given, so the name stays unenforced there. Alternative:
  refuse a join token whose encrypted name cannot be checked, which would block encrypted rooms for members.
