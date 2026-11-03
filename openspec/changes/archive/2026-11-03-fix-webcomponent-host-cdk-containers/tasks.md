# Tasks

## 1. Move only Meet's own nodes

- [x] 1.1 In `meet-ce/frontend/webcomponent/src/app/shadow-dom/body-nodes.service.ts`, replace the body-wide observer: provide the CDK live announcer element token with an element Meet creates detached and appends to the shadow root of each mount, and move only the describedby container whose message ids carry Meet's own application id (`APP_ID`), both provided in `webcomponent/src/app/app.config.ts`. Verify with unit tests of the service (host nodes added before and after mount stay in `body`, Meet's nodes move) and a case in the webcomponent e2e suite where the host appends both nodes after mount (needs the testapp; report as not run when unavailable).

## 2. Release surfaces

- [x] 2.1 `CHANGELOG.md`: none. The shadow-root isolation is the 3.10.0 `Fixed` > `UI` entry "The styles of `<openvidu-meet>` reached the host page ..." (#135); this fix completes it without a line of its own.
- [x] 2.2 openvidu.io: none.
