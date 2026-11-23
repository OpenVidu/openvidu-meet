# Design

## Approach (3.10.0)

Frontend only, in the shared library; no architecture decision.

- `meet-ce/frontend/projects/shared-meet-components/src/lib/domains/room-members/utils/ui.ts`: a pure `RoomMemberUiUtils` helper that is true for an identified guest whose `accessUrl` `secret` equals its `memberId`. The server returns `accessUrl` as an absolute URL; the helper reads its `secret` query parameter. A user member's link carries no `secret`, so the helper is false for it.
- `room-members/components/room-members-list/room-members-list.component.{html,scss}`: in the name column, a `warning` icon next to the member's name when the helper is true, with the tooltip from the proposal's assumptions as `matTooltip` and as its accessible label (`aria-hidden="false"` and `aria-label` on the `mat-icon`, which Material hides from assistive technology by default). It uses the `Material Icons` font, like the console's other warning icons, so no Material Symbol is declared.
- `room-members/lang/*.json`: one key, `ROOM_MEMBERS.LIST.DEPRECATED_ACCESS_LINK`, in every locale of the bundle.

The members list already loads each member's `accessUrl` (the copy link action reads it), so no request changes. The mark depends only on the member the browser already holds, so the number of Meet replicas plays no part.

Test: a console e2e test in `meet-ce/frontend/e2e/console/room-detail.test.ts`. No API creates a guest of the old form, so the test intercepts `roomListMembers` with `page.route`, as the recordings test of that file does, and rewrites one guest's `accessUrl` to carry its `memberId` as the `secret`. It checks that this guest shows the icon and the tooltip and that a current guest and a user member do not.

## What 3.13.0 does (decided now, proposed then)

Recorded so the `replace-pre-3-10-guest-links` change of 3.13.0 starts from the user's decisions (proposal, decisions 1 and 4 to 6):

- A room member schema migration gives each identified guest whose `accessUrl` `secret` equals its `memberId` the link of the current form, `/room/{roomId}?secret=<memberId>-<random>`, keeping the `memberId`, so participant identities and integrations that correlate on it are untouched. It is the usual forward-only step: a bumped `ROOM_MEMBER_SCHEMA_VERSION` with a refreshed `MIGRATION_REV`, run at startup under the migration lock.
- The same step sets each migrated member's `permissionsUpdatedAt` to the migration time. Every room member token of a member is checked against that timestamp, so a token issued from the old link is refused from then on, as after a permission change (decision 5). The 3.13.0 change checks what that refusal does to a guest who is in a meeting during the upgrade.
- Once migrated, the old `secret` matches no stored link, so the existing rule already refuses it with `404`. The server only drops the warning it logs for the old form.
- The meeting shows an error screen of its own, asking for a new link, when the server answers `404` to a `secret` of the old form (the member id alone, `guest-` and ten hexadecimal characters, with no `-` and random part after it). The screen is chosen in the frontend's mapping of token failures from the `secret` it sent (which `roomMemberTokenFailure` then receives besides the error), so no server error code is added. "Invalid member" stays for every other `guest-` secret. This touches the `meeting-join` list of access error screens.
- Meet does not tell the manager which guests got a new link: the guest learns it from that screen and asks the manager, who copies the current link from the Room Members tab (decision 6). The 3.13.0 upgrade note says so.
- The console mark of this change, its translations and the `room-members` requirement it adds are removed, and the deprecation requirement goes with them.
- `CHANGELOG.md` (3.13.0) gets a `Breaking changes` line.
