# Proposal

## Decisions

USER, request of 2026-11-21:

- The access links of identified guests added before 3.10.0 (`secret` equal to the guest's `memberId`) keep working as they are until 3.13.0.
- Until then the console warns about the members they affect: a warning with a tooltip on hover saying the link may be insecure and that re-creating the member fixes it.
- In 3.13.0 those links are migrated to the secure form, and whoever opens an old link sees an error screen or notice asking them to request a new one from the admin.

USER, answers of 2026-11-21 (round 1):

1. This change covers 3.10.0 only. What 3.13.0 does is decided now and recorded in this change (design, the deprecation requirement, `CHANGELOG.md`); the 3.13.0 change is proposed when that release starts, as the 3.12.0 removal of the deprecated names is.
2. The warning is an icon in the member's row of the Room Members tab, next to the name, with the tooltip on hover. No banner on the edit member page and no notice when copying the link.
3. The console tells an old link apart from the member it already reads: the `secret` of its `accessUrl` equals its `memberId`. No field is added to the REST API or the typings.
4. In 3.13.0 an old link shows an error screen of its own, asking for a new link. The meeting picks it when the server answers `404` to a `secret` of the old form; the server does not change for it. The migration gives each such guest a link of the current form and keeps their `memberId` (request, and question 4 of round 1).

USER, answers of 2026-11-21 (round 2, about 3.13.0): 5. The 3.13.0 migration also invalidates the room member tokens already issued from an old link. 6. Meet does not tell the manager which guests got a new link. A guest who opens an old link sees the error screen of decision 4 and contacts the manager, who copies the guest's current link from the Room Members tab.

## Assumptions

- The tooltip reads: "This link may be insecure because it was created before OpenVidu Meet 3.10.0. Remove this member and add them again to get a secure link. In 3.13.0 Meet replaces it and the old link stops working." It is translated into every locale of the room members bundle.
- The icon uses the theme's warning color and carries the tooltip text as its accessible label.

## Why

3.10.0 deprecates the link of every identified guest added before it, because its `secret` is the guest's `memberId`, which every participant of a meeting with that guest can read and reuse to enter as them. Today a room manager only learns which guests are affected from the server log, written when an old link is used, or by comparing each `accessUrl` with its `memberId` through `roomListMembers`. The console, where the manager copies and sends these links, says nothing.

## What Changes

- The console's Room Members tab marks each identified guest whose `accessUrl` carries their `memberId` as its `secret` with a warning icon next to the name; its tooltip says the link may be insecure and that removing the member and adding them again gives a secure link. Guests with a link of the current form and user members carry no mark.
- The deprecation notice says what 3.13.0 does: each remaining guest gets a link of the current form with the same `memberId`, and the old link stops granting access.
- Unchanged: every link keeps working as today, and the server, the tokens, the REST API, the webhooks and the embedded API stay as they are. The server keeps logging a warning each time an old link is used.

Follow-up, in 3.13.0: `replace-pre-3-10-guest-links`, a room member migration giving those guests a link of the current form and invalidating the tokens issued from their old one (decision 5), the error screen for an old link (decisions 4 and 6), the removal of the console mark and of the server warning, and its `Breaking changes` line.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `room-members`: the requirement on guest links issued before 3.10.0 states what 3.13.0 does with those links, and a new requirement adds the console mark.

## Impact

- Console UI: the Room Members tab of the room detail page shows the mark and its tooltip; new translations in the room members bundle.
- REST API, webhooks, embedded API, typings: no change.
- Meeting UI: no change in 3.10.0.
- Deployment: no change; no migration, no configuration.
- CE extension seams: none needed. The mark lives in the members list component of the shared library, which every edition reuses.
- openvidu.io (`next`): `docs/meet/features/room-members/management.md`, the "Identified guests added before 3.10.0" note, says the Room Members tab marks those guests and what 3.13.0 does with their links. No screenshot or video changes: the existing ones show no guest added before 3.10.0.
- `CHANGELOG.md` (3.10.0): the `Deprecated` line about these links says what 3.13.0 does and that the console marks them; no line of its own, since the deprecation ships in the same unreleased version.
