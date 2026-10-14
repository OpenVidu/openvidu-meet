## Why

On a phone the status rail kept a single row and folded the rest into a Meeting status menu. In a
busy meeting the raised hands chip covered the reactions pulse, and the encryption mark, the
recording time, the participants left off the grid and most reactions were only reachable through
the menu.

## What Changes

- Below 790 px every status rail chip stays visible, without its words, and the Meeting status menu
  is removed.
- The rail keeps one row while its chips fit, laid out as on desktop, and moves the raised hands, the
  reactions pulse and the hidden participants indicator to a second row only when they no longer fit.
- Desktop is unchanged.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

- `meeting-layout`: "Status rail on phones" describes the one-or-two-row rail instead of the menu.

## Impact

- Meeting UI only (status rail and the grid height while the second row is shown). No API,
  webhook or embedded API change.
- The `ROOM.STATUS_MENU` translation key is removed.
- CHANGELOG: the unreleased 3.10.0 Fixed > UI line about the phone status rail is rewritten instead
  of adding a new one.
- openvidu.io: none.
