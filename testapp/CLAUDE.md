# Testapp (`@openvidu-meet/testapp`)

A host application (Angular, standalone) that embeds Meet the way an integrator would, through the
`<openvidu-meet>` webcomponent or an `<iframe>`. It is not shipped: it exists to try the embedded API
by hand and to give the webcomponent e2e suites a host page. Product behavior is specified in
`openspec/specs/` (`embedded-api` and each feature's capability), not here.

## Running it

`./meet.sh start-testapp` (or `./meet.sh dev --testapp`) serves it on `:5080`, next to a webhook
bridge on `:5081` (`scripts/webhook-bridge.js`) that receives Meet webhooks and pushes them to the page
over Socket.IO. `proxy.conf.js` forwards same-origin paths (bundle, API, `/webhook`, `/socket.io`) to
the real services, overridable with `MEET_API_URL`, `MEET_API_KEY` and `MEET_WEBHOOK_BRIDGE_URL`. A
static serve of `dist/` does not work: the dev server's proxy is part of the setup.

The webhook events reach the page only if Meet has a webhook registered to
`http://localhost:5080/webhook`. `MEET_INITIAL_WEBHOOK_ENABLED` and `MEET_INITIAL_WEBHOOK_URL` seed it
(`meet-ce/backend/.env.test` and the webcomponent e2e workflow set them). The backend webhook
integration tests delete every webhook; recreate it with `webhookCreate` afterwards.

## Layout

- `src/app/services/`: one service per concern. `meet-commands.ts` drives the element's methods,
  `iframe-host.ts` posts the same commands over `postMessage`, `webhook-bridge.ts` consumes the
  bridge, `meet-api.ts` lists rooms with the API key.
- `src/app/components/`: setup and commands panels, the room browser and the console dock (event log).
- `src/app/openvidu-meet-element.ts` declares the subset of the element API the app uses. No `.d.ts`
  is published, so a host declares its own; this file is the reference one.

## When the embedded API changes

A new attribute, command or event needs its control here (in both the webcomponent and the iframe
paths) so the e2e suites can exercise it on both transports.

The webcomponent e2e suites reach the testapp only through
`meet-ce/frontend/webcomponent/tests/helpers/testapp.helper.ts` and
`webcomponent-attributes.helper.ts`. Keep every `data-testid` and element `id` stable; a helper that
clicks a control calls `showControlsPanel()` first because the tabs hide half of them.

## Gotchas

- The Vite dependency cache of `ng serve` does not notice a rebuilt `@openvidu-meet/typings`: a new
  enum member then reads as `undefined` and iframe commands silently post nothing. Delete
  `testapp/.angular/cache` and restart.
- The page loads whatever bundle the backend serves from `meet-ce/backend/public/webcomponent/`;
  rebuild it (`pnpm --filter @openvidu-meet/webcomponent run build:wc:bundle`) after library changes.
