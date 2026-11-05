# Tasks

## 1. Row link

- [x] 1.1 Add `RowLinkDirective` (`ovRowLink`) to `shared-meet-components/src/lib/shared/directives`: it opens its commands on click unless a text selection is active or the target is inside a link, a button, an input, a checkbox or the select and actions columns, opens a new tab on Ctrl or Cmd, and sets the pointer cursor.
- [x] 1.2 Use it on the rows of the rooms, recordings and users lists, remove the `*Clicked` outputs and the page handlers with their four error messages in every locale, and make the room and user ids links sharing one `%ov-link` style; the recordings list links the room id to the room.
- [x] 1.3 Lint and a production build of the frontend pass.

## 2. Release surfaces

- [x] 2.1 Add one line to `CHANGELOG.md` under the unreleased 3.10.0, `Improved` > `UI`.
- [x] 2.2 openvidu.io: none.

## Workflow follow-up

- Archive the change inside the pull request and run `npx openspec validate --all --strict`.
