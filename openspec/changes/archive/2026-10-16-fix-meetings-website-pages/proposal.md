# Proposal

## Why

Five openvidu.io pages of the meeting features (branch `next`) describe behavior the specs and the code contradict:

- `docs/meet/features/meetings/overview.md:10`: a meeting "starts when the first participant joins and ends when the last one leaves" and "only exists while at least one participant is connected". It starts when a participant presses Join, before connecting, and outlives its last participant by 20 seconds (`meetings` "A meeting starts when a participant commits to join", "A meeting outlives its last participant for 20 seconds").
- `docs/meet/features/meetings/moderation.md:27`: a holder of `participantKick` "can remove any other participant". The participants panel never offers Remove for original moderators, the room owner or administrators; only the REST API and the embedded command reach every participant (`meeting-moderation` "Remove participants from the participants panel").
- `docs/meet/features/meetings/virtual-background.md:59`: the More Options entry is called "Virtual Background"; the meeting labels it **Background effects**.
- `docs/meet/features/meetings/smart-layout.md:21`: Smart Mosaic shows "up to 4 by default"; phones and tablets default to 2 (`meeting-layout`).
- `docs/meet/features/meetings/e2e-encryption.md:56`: the passphrase is "never sent to the server". Typed on the join screen it is not, but given as the `e2ee-key` query parameter of a direct link or iframe `src` it travels in the page request to the Meet server before the meeting removes it from the address bar (`meeting-join` "Secret and encryption key are kept out of the address bar").

## What Changes

- Correct the five passages on openvidu.io `next`. No change in this repository besides this proposal.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. Documentation only: the pages are brought in line with the `meetings`, `meeting-moderation`, `meeting-media`, `meeting-layout` and `meeting-join` specs.

## Impact

- openvidu.io `next`: the five pages above.
- REST API, webhooks, embedded API, meeting UI, console UI, deployment configuration: not affected.
