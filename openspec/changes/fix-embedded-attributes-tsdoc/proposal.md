# Proposal

## Why

Two attribute descriptions of the embedded API reference promise more than Meet does:

- `e2ee-key`: "If provided, the participant will join the meeting using E2EE key." Meet ignores the key when the room's `config.e2ee.enabled` is `false`, so the meeting is not encrypted.
- `participant-name`: "Display name for the local participant." The room member record (identified guests and member users) and the signed-in user's name take precedence over it.

The specs already state the real behavior (`meeting-media` "Encryption key of an encrypted meeting", `meeting-join` "Participant name precedence"); only the reference generated from the TSDoc is wrong. Documentation only: `skip_specs: true`, no behavior changes.

## What Changes

- TSDoc of `EmbeddedAttribute.E2EE_KEY` and `WebComponentPropertyValues.e2eeKey`: the key is used only in a room whose `config.e2ee.enabled` is `true`, where it fills the join screen's encryption key, and is ignored otherwise.
- TSDoc of `EmbeddedAttribute.PARTICIPANT_NAME` and `WebComponentPropertyValues.participantName`: the name fills and locks the join screen's name field unless the participant is a room member or a signed-in user, whose own name is used instead.
- The generated attribute reference on openvidu.io is regenerated from them.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only.

## Impact

- Embedded API: reference text only, no contract change; the attribute list, names and types are unchanged.
- Meeting UI, REST API, webhooks, console UI, deployment configuration: not affected.
- Code: `meet-ce/typings/src/embedded/attributes.ts` (TSDoc only).
- openvidu.io: `shared/meet/webcomponent/attributes.md`, regenerated.
