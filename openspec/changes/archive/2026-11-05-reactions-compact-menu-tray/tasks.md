# Tasks

## 1. Reactions row in the compact menu

- [x] 1.1 In `meeting-toolbar-reactions-button` (`meet-ce/frontend/projects/shared-meet-components/src/lib/domains/meeting/customization/`), replace the mobile grid with a Reactions row that unfolds the tray, with `aria-expanded`, `prefers-reduced-motion` and the `REACTIONS.LIFETIME` caption.
- [ ] 1.2 Check in a phone-width window (Playwright against the local deployment, or by hand): the row opens the tray, the menu stays open, a reaction closes the menu and shows on the tile. Report as not run when the deployment is unavailable.

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none, reactions are an unreleased 3.10.0 feature and the entry does not name the grid.
- [x] 2.2 openvidu.io: none, the reactions page only says that on phones the reactions are in More options.
