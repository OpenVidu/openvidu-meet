# Tasks

## 1. Id links

- [x] 1.1 In the list components of rooms, recordings and users (`shared-meet-components`), make the id an `<a [routerLink]>` to the detail page (the signed-in user's id to `/profile`), remove the row click, the `*Clicked` outputs and the `$event.stopPropagation()` calls that only guarded it, and share one `%ov-link` style with the existing profile links.
- [x] 1.2 Show the recording id in its own column of the recordings table and in the phone cards of every list.
- [x] 1.3 Remove the page handlers of the removed outputs and the four error messages they used from every locale; lint and a production build of the frontend pass.

## 2. Release surfaces

- [x] 2.1 Add one line to `CHANGELOG.md` under the unreleased 3.10.0, `Improved` > `UI`.
- [x] 2.2 openvidu.io: none.

## Workflow follow-up

- Archive the change inside the pull request and run `npx openspec validate --all --strict`.
