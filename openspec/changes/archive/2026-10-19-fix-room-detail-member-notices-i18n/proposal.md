# Proposal

## Why

The console room detail page shows its member and loading notices in English whatever language the user
chose: "Member access link copied to clipboard", "Member "X" removed successfully", "Failed to remove
member", the bulk deletion count ("N members removed successfully. M members could not be removed."),
"Failed to remove members", "Failed to load room members" and "Failed to load recordings". The rest of the
page, the room id copy notice included, is translated.

## What Changes

- Those notices come from the translation bundles of the `rooms` and `room-members` domains, in the ten
  supported languages, with the counts as parameters.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None. The `localization` spec already states the behavior: requirement "Supported languages" offers the
console in every supported language. No scenario names these notices; the fix makes the requirement hold
for the room detail page, and a test covers it (see tasks).

## Impact

- Console UI: the room detail page's notices.
- REST API, webhooks, embedded API, meeting UI, deployment configuration: none.
- Code: `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/rooms/pages/room-detail/room-detail.component.ts`
  and the `lang/*.json` bundles of `rooms` and `room-members`. A deployment or PRO that overrides
  translations gets new keys, with English as the fallback.
- openvidu.io: none.
