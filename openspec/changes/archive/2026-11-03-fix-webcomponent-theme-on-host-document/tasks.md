# Tasks

## 1. One theme target element

- [x] 1.1 In `theme.service.ts` (`shared/services`) and `meeting-theme.service.ts` (`domains/meeting/openvidu-components/services/theme`) of `shared-meet-components`, write `data-theme`, `data-ov-theme` and the `--ov-*` properties to one injectable root element (`THEME_ROOT_ELEMENT`): `document.documentElement` by default, none in the webcomponent (`null`, provided from `meet-ce/frontend/webcomponent/src/app/app.config.ts`), whose App host renders the theme from `MeetingThemeService.appliedVariables` instead, since one root injector serves every mount of the element. Verify with unit specs of both services (target element receives the attributes, `document.documentElement` does not when overridden).
- [x] 1.2 Check the App host binding of `data-theme` still drives `:host([data-theme='dark'])` and that custom properties on the host reach the shadow tree. Verify by extending the existing webcomponent e2e "Meet's rules do not reach the host page" with the host `<html>` attributes and inline style before and after connect, after an OS color-scheme change and after removal (needs the testapp; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: no new line. The fix makes the 3.10.0 `Fixed` > `UI` entry "The styles of `<openvidu-meet>` reached the host page ... Each side's styles now stay on its side of the element's shadow root" true; keep its wording.
- [x] 2.2 openvidu.io: none.
