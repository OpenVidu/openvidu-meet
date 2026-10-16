# Tasks

## 1. openvidu.io pages (branch `next`)

- [x] 1.1 `docs/meet/features/meetings/overview.md:10`: say the meeting starts when the first participant presses Join and ends 20 seconds after the last participant leaves (or when it is ended for everyone), and drop "only exists while at least one participant is connected"; verify with the site's `check-web` lint.
- [x] 1.2 `docs/meet/features/meetings/moderation.md:27` ("Removing participants"): say the participants panel offers Remove for participants who are not moderators in their own right (and for those promoted during the meeting), never for original moderators, the room owner or administrators, while the REST API and the `participantKick` command can remove any participant; verify with `check-web`.
- [x] 1.3 `docs/meet/features/meetings/virtual-background.md:59`: replace "Select **Virtual Background**" with "Select **Background effects**"; verify with `check-web`.
- [x] 1.4 `docs/meet/features/meetings/smart-layout.md:21`: say Smart Mosaic shows up to 4 remote participants by default, 2 on phones and tablets; verify with `check-web`.
- [x] 1.5 `docs/meet/features/meetings/e2e-encryption.md:56`: keep that the key is derived on each device and that a passphrase typed on the join screen never leaves it, and add that one given as the `e2ee-key` query parameter of a direct link or iframe `src` reaches the Meet server with the page request before the meeting removes it from the address bar; verify with `check-web`.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no line. Documentation-only change.
- [x] 2.2 openvidu.io: the five pages of group 1.
