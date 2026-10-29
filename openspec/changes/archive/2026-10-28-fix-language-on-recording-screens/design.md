# Design

## Context

Until this change the meeting entry service applied `language` on every entry, with `undefined` restoring the stored
preference, and the webcomponent carried it in its meeting route. Doing the same in the recording entry services would
have reset the language on the app's own navigations, which go through those entries without it: from the lobby to the
room recordings, and from the room recordings back to the room. The iframe already lost the language on the second one.

## Decisions

- **The language belongs to the page or the element, not to a view.** It is applied where the embedding application
  sets it, and every screen follows it.
- **Webcomponent: an effect on the inputs.** `App` applies `language` (or the stored preference when unset) and
  `show-language-selector` whenever either input changes, including the first render. A host that removes `language`
  gets the stored preference back on whatever screen is showing. The meeting route and `MeetingEntryService` no longer
  carry either value.
- **Iframe and direct link: a guard that applies what the URL carries.** `applyRequestedLanguageGuard` runs first on the
  meeting, room recordings and recording routes and applies the two values only when the URL has them. Each iframe load
  or direct link is a new app, so an entry without `language` starts from the stored preference anyway, and the app's
  own navigations, which never carry it, keep the language the page was opened with.
- Alternative considered: carry `language` through every internal navigation (redirect paths, `goToRoomRecordings`,
  `goBackToRoom`). Rejected: more code on every path, and any new navigation that forgot it would reset the language.
