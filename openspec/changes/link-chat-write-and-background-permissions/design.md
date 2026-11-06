# Design

## Context

- The permission UI is declared once in `PERMISSION_GROUPS` (shared-meet-components,
  `room-members/models/permissions.model.ts`). An item may name `dependsOn`; today only `broadcastEdit` does.
  `DEPENDENT_PERMISSIONS` is derived from it.
- The wizard's Room Access step (`room-access.component.ts`) honours `dependsOn` with one `valueChanges`
  subscription per parent control, layered under the feature constraints (chat, virtual background and
  broadcast off disable their switches). The member form (`member-form.component.ts`) uses the same
  `PERMISSION_GROUPS` but no dependency logic, and resets its toggles with `setValue(..., { emitEvent: false })`,
  so a parent subscription would not see a role change.
- Both forms keep a disabled control's value: the wizard because Angular preserves it, the member form because
  it submits `getRawValue()`.
- The LiveKit grant is built in one place, `RoomMemberService.buildPublishGrant`, from the full permission set
  and `config.chat.enabled`, for join tokens, refreshed tokens, promotions, demotions and member updates applied
  live. Chat is the only data a participant publishes.
- The meeting decides whether to offer background effects in `FeatureCalculator.applyPermissions`
  (`showBackgrounds`); the meeting view already removes an applied effect and closes the panel when that flag
  turns `false`.
- The `permissions` spec's "Independent permissions" requirement holds every combination of values valid, and
  the user decision behind it forbids deriving one stored permission from another.

## Goals / Non-Goals

**Goals:**
- One declaration (`dependsOn`) drives the dependency in both console forms.
- The server grant matches what the interface allows for chat.

**Non-Goals:**
- Rejecting or rewriting a stored `chatWrite: true` without `chatRead`, or a background permission without
  the camera one: values stay independent, the dependent one simply has no effect.
- Applying the room feature switches (chat, virtual background, broadcast off) to the member form.
- Any other dependency (recording, moderation): discussed and left out.

## Decisions

1. **Server: `canPublishData = chatEnabled && chatRead && chatWrite`** in `buildPublishGrant`. Every path that
   issues or pushes a grant goes through it, so join, refresh, promotion, demotion and live member updates
   follow without further changes. Alternative: refuse `chatWrite` without `chatRead` at write time with `422`;
   rejected because it breaks "Independent permissions" and stored rooms that already hold that combination.

2. **Meeting: `showBackgrounds` also requires `mediaPublishVideo`** in `FeatureCalculator.applyPermissions`,
   next to the `mediaChangeVirtualBackground` check. The existing reaction to the flag turning off covers a
   camera permission revoked mid-meeting. No server part: the effect is applied in the browser.

3. **One idempotent sync function for both forms.** Replace the wizard's per-parent subscriptions with a
   function in the room-members domain that, given a permissions `FormGroup` and the set of keys locked by
   something else (the wizard's feature constraints; empty in the member form), enables each
   `DEPENDENT_PERMISSIONS` control when its parent is on and it is not locked, and disables it otherwise, always
   with `emitEvent: false`. The wizard calls it once at start and on each role form's `valueChanges`; the member
   form on its permissions group's `valueChanges` and after every programmatic reset or prefill (role change,
   edit load), which emit no events. Alternative: keep per-parent subscriptions and copy them into the member
   form; rejected because it duplicates the logic and misses the silent resets.

4. **`dependsOn` added to `chatWrite` (`chatRead`) and `mediaChangeVirtualBackground` (`mediaPublishVideo`).**
   The Media group is reordered so the background item follows `mediaPublishVideo`: the `.dependent` row style
   reads as a child of the row above it. The two i18n descriptions gain the "Needs ..." suffix `broadcastEdit`
   already uses, in all ten locales.

5. **Contracts describe the dependency.** The typings TSDoc and the OpenAPI `MeetPermissions` descriptions of
   `chatWrite` and `mediaChangeVirtualBackground` say they are only effective together with the other
   permission, as `broadcastEdit` does. The descriptions of the deprecated `can*` aliases stay as they are.

## Risks / Trade-offs

- [A deployment granted `chatWrite` without `chatRead` on purpose, for a client that writes blind] → that
  client can no longer send. The Meet interface never offered it, so only a custom client is affected; the
  CHANGELOG line names the new rule.
- [A participant in a meeting during the upgrade keeps the grant of the token they joined with] → it is
  replaced on the next token renewal or permission change; no stored data changes, so no migration and no
  rollback step beyond redeploying the previous version.
- [The member form's dependent toggle can show `on` while disabled, which may read as granted] → same
  presentation as the wizard today, with the shared "Grant the permission this one depends on" tooltip.

## Migration Plan

None: no persisted field changes. With several replicas, each computes the grant from the stored permissions on
every request, so all replicas apply the rule as soon as they run the new version.
