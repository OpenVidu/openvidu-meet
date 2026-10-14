# Embedded Distribution Specification

## Purpose

Embedded distribution is how a host application gets Meet onto its pages: the `<openvidu-meet>` webcomponent served by the Meet server itself, an iframe, or a direct link. Hosts rely on it to always run the version their Meet server runs, without rebuilding or redeploying their own application.

Surfaces: the two bundle URLs `<base path>/v1/openvidu-meet.js` (loader) and `<base path>/v1/openvidu-meet.esm.js` (full bundle) served by the Meet server, the `<openvidu-meet>` element's loading, moving and removal, room and recording URLs used as an iframe `src` or as a link, and cross-origin access (`SERVER_CORS_ORIGIN`). The base path itself and the rest of the serving are in `deployment`; the contract of the element once loaded is in `embedded-api`. Documented in openvidu.io `docs/meet/embedded/reference/webcomponent.md` (Installation), `iframe.md` and `direct-link.md`.

## Requirements

### Requirement: Two stable bundle URLs
The server SHALL distribute the webcomponent bundle through exactly two URLs, the same in every release: `<base path>/v1/openvidu-meet.js`, the loader a host includes with a `<script>` tag, and `<base path>/v1/openvidu-meet.esm.js`, the full bundle the loader imports, served as one single file and never split into further chunks with URLs of their own.

#### Scenario: Default base path
- **GIVEN** a deployment with the default base path `/meet`
- **WHEN** a host includes `<script src="https://meet.example.com/meet/v1/openvidu-meet.js"></script>` and renders `<openvidu-meet>`
- **THEN** the element's bundle is fetched from `https://meet.example.com/meet/v1/openvidu-meet.js` and `https://meet.example.com/meet/v1/openvidu-meet.esm.js` only, with no chunk from any other URL

#### Scenario: Upgrade of the Meet server
- **GIVEN** a host page that includes the loader URL
- **WHEN** the Meet server is upgraded to a new release
- **THEN** the same URLs serve the new release and the host page needs no change

### Requirement: Bundles are revalidated on every load
The server SHALL serve both bundle URLs with `Cache-Control: no-cache` and a strong `ETag` derived from the file's content. A request whose `If-None-Match` contains the current `ETag` SHALL be answered `304` without a body; after a redeploy that changes the content, the same URL SHALL answer `200` with the new content and a new `ETag`. A redeploy with identical content SHALL keep the `ETag`.

#### Scenario: Revisit without a redeploy
- **GIVEN** a browser that already loaded both bundles
- **WHEN** the host page is loaded again
- **THEN** both bundle requests are answered `304` with no body

#### Scenario: First visit after a redeploy
- **GIVEN** a browser holding the previous full bundle in its cache
- **WHEN** the full bundle is redeployed with new content and the host page is loaded again
- **THEN** the full bundle URL answers `200` with the new content and a different `ETag`
- **AND** the page runs the new version on that same load

#### Scenario: Rebuild with identical content
- **WHEN** the bundles are redeployed byte for byte identical
- **THEN** their `ETag`s do not change and cached copies keep being answered `304`

### Requirement: The full bundle can be imported from any origin
The server SHALL serve the full bundle with `Access-Control-Allow-Origin: *`, on `200` and on `304` answers alike, so a page on any origin can import it as a module. The loader, included as a classic script, SHALL need no such header.

#### Scenario: Host on another origin
- **GIVEN** a host page on `https://app.example.com` that includes the loader of `https://meet.example.com`
- **WHEN** the loader imports the full bundle
- **THEN** the response carries `Access-Control-Allow-Origin: *` and the browser runs the module

### Requirement: The element calls the Meet server named by its URL
The embedded element SHALL send its requests to the Meet server named by its `room-url`, the part of the URL before `/room/`, or by its `recording-url`, the part before `/recording/`, whatever the origin of the host page.

#### Scenario: Element on a host origin
- **GIVEN** a host page on `https://app.example.com`
- **WHEN** it renders `<openvidu-meet room-url="https://meet.example.com/meet/room/r-1?secret=s">`
- **THEN** the element's requests go to `https://meet.example.com/meet`

### Requirement: Cross-origin requests to the Meet server
The server SHALL answer cross-origin requests with the origin configured in `SERVER_CORS_ORIGIN`, every origin (`*`) by default, so that the element running on a host page can call it.

#### Scenario: Default configuration
- **GIVEN** `SERVER_CORS_ORIGIN` is not set
- **WHEN** the element on `https://app.example.com` calls the Meet server on `https://meet.example.com`
- **THEN** the answers allow that origin and the element works

#### Scenario: Restricted origin
- **GIVEN** `SERVER_CORS_ORIGIN=https://app.example.com`
- **WHEN** a page on `https://other.example.com` embeds the element pointing at that Meet server
- **THEN** the browser blocks the element's requests, while the element on `https://app.example.com` works

### Requirement: The element is defined at once and the full bundle loads on first use
The embedded element SHALL be defined as soon as the loader runs, without loading the full bundle. The full bundle SHALL be loaded the first time an `<openvidu-meet>` element is connected to the document, once per page for all elements, and the element SHALL show a loading placeholder, exposed as the shadow part `loading`, until Meet is ready inside it.

#### Scenario: Loader included, no element yet
- **WHEN** a host page includes the loader and renders no `<openvidu-meet>`
- **THEN** `customElements.get("openvidu-meet")` is defined and the full bundle is not requested

#### Scenario: Several elements on the page
- **WHEN** a host page connects two `<openvidu-meet>` elements, one after the other
- **THEN** the full bundle is requested once

#### Scenario: Element removed while loading
- **GIVEN** an element whose full bundle is still loading
- **WHEN** the host removes the element from the document before the load finishes
- **THEN** no Meet is started inside it

### Requirement: Calls made before the bundle loads are kept
The embedded element SHALL keep the attributes and properties a host sets, the method calls it makes and the listeners it registers before the full bundle has loaded. Once loaded, it SHALL apply the last value written to each attribute or property, deliver the calls in the order they were made, each then accepted or rejected as `embedded-api` specifies, and deliver later events to those listeners.

#### Scenario: Listener registered before the load
- **GIVEN** a host that calls `element.on("meetingJoined", callback)` right after creating the element
- **WHEN** the bundle loads and the participant joins
- **THEN** the callback receives the `meetingJoined` payload

#### Scenario: Property read before the load
- **WHEN** a host sets `element.participantName = "Bob"` and reads it back before the bundle has loaded
- **THEN** it reads `Bob`

### Requirement: The full bundle falls back to the Meet server
The embedded element SHALL import the full bundle from next to the loader's own URL. If that import fails, it SHALL import it from `/v1/openvidu-meet.esm.js` under the Meet server named by `room-url` or `recording-url`, read at the moment of the failure, and SHALL log a console warning naming both URLs. There SHALL be no fallback when that URL is the one that failed or when neither attribute is set.

#### Scenario: Host proxies only the loader
- **GIVEN** a host that serves only `/openvidu-meet.js` through its own proxy, as 3.8.0 hosts did
- **WHEN** it renders `<openvidu-meet room-url="https://meet.example.com/meet/room/r-1?secret=s">`
- **THEN** the element loads `https://meet.example.com/meet/v1/openvidu-meet.esm.js` and works
- **AND** the browser console warns that the sibling URL was not reachable

#### Scenario: URL bound by a framework after connection
- **GIVEN** a host framework that sets `room-url` right after inserting the element, and a sibling URL that fails
- **WHEN** the sibling import fails
- **THEN** the fallback uses the `room-url` set by then

### Requirement: A failed load can be retried
When the full bundle cannot be loaded, the embedded element SHALL replace the placeholder with an error box, exposed as the shadow part `error`, reading "Could not load OpenVidu Meet." with a Retry button, and SHALL log the failure in the browser console. Retry SHALL show the placeholder and load again; a failed load SHALL NOT be reused by a retry or by another element.

#### Scenario: Meet server unreachable
- **GIVEN** the Meet server is unreachable when the element connects
- **WHEN** the load fails
- **THEN** the element shows "Could not load OpenVidu Meet." and a Retry button

#### Scenario: Retry after the server is back
- **GIVEN** an element showing the load error
- **WHEN** the Meet server is reachable again and the participant clicks Retry
- **THEN** the element loads the bundle and starts Meet

### Requirement: Moving the element keeps the meeting
The embedded element SHALL keep Meet, and any meeting in progress, running when it is removed from the document and inserted again within 10 milliseconds, as moving it to another parent does. Its attributes and listeners SHALL be kept.

#### Scenario: Element moved during a meeting
- **GIVEN** a participant in a meeting through the element
- **WHEN** the host moves the element to another container
- **THEN** the participant stays in the meeting without reconnecting
- **AND** listeners registered with `on` keep receiving events

### Requirement: Removing the element ends its Meet
When the embedded element stays out of the document for more than 10 milliseconds, it SHALL stop the Meet running inside it, and the local participant SHALL leave any meeting in progress. The removal is the host's own decision, so the element SHALL emit no event for it. Inserting the element again later SHALL start Meet anew from its attributes, without downloading the full bundle again.

#### Scenario: Element removed during a meeting
- **GIVEN** a participant in a meeting through the element
- **WHEN** the host removes the element and does not insert it again
- **THEN** the participant leaves the meeting and the others see them leave
- **AND** the host receives no `meetingLeft` nor any other event from the element

#### Scenario: Element inserted again later
- **GIVEN** an element removed a second ago
- **WHEN** the host inserts it again
- **THEN** Meet starts again from the element's attributes and the full bundle is not requested again

### Requirement: A new element starts clean
The embedded element SHALL start from its own attributes only, carrying no state from an element that was removed before it on the same page: not its identity, its screen, its meeting state nor its media state.

#### Scenario: Identified guest, then moderator
- **GIVEN** an element that entered a room through an identified guest's access URL and was then removed
- **WHEN** the host adds a new element with the room's anonymous moderator URL
- **THEN** the join screen does not show the guest's name and the name field is editable

#### Scenario: Media commands after a remount
- **GIVEN** an element whose participant left a meeting, removed and replaced by a new element on the same page
- **WHEN** the new element's participant joins and the host calls `mediaToggleVideo(false)`
- **THEN** the camera is turned off

### Requirement: Meet renders inside the element's shadow root
The embedded element SHALL render Meet, its dialogs and menus included, inside the element's shadow root rather than in the host page's document tree.

#### Scenario: Dialog opened in the meeting
- **GIVEN** a participant in a meeting through the element
- **WHEN** they open a menu or a dialog of the meeting
- **THEN** it is rendered inside the element's shadow root and `document.querySelector` on the host page does not find it

### Requirement: Fonts are added to the host page once
The embedded element SHALL add to the host document's `<head>` the Roboto, Material Icons and Material Symbols font stylesheets from Google Fonts, once per page, and SHALL NOT add a stylesheet link that is already there.

#### Scenario: Two elements on one page
- **WHEN** a host page connects two elements
- **THEN** its `<head>` holds exactly one link to each of the three font stylesheets

### Requirement: Iframe embedding
Meet SHALL run inside an iframe whose `src` is a room access URL or a recording URL, carrying the embedded attributes as query parameters, and SHALL behave there as embedded: the meeting communicates with the containing page through `postMessage` as `embedded-api` specifies.

#### Scenario: Room URL as iframe source
- **WHEN** a host page loads an iframe with `src` set to a room's anonymous speaker URL and an `allow` attribute granting camera, microphone and display capture
- **THEN** the participant can join the meeting inside the iframe
- **AND** the containing page receives `meetingJoined` as a message

### Requirement: Direct link
Meet SHALL run as the standalone app when a room access URL or a recording URL is opened directly in a browser tab, carrying the embedded attributes as query parameters, with no command or event channel to any other page.

#### Scenario: Link to a room
- **WHEN** a person follows a link to `https://meet.example.com/meet/room/r-1?secret=s&participant-name=John`
- **THEN** the room's join screen opens in that tab with `John` pre-filled
- **AND** no embedded event is emitted
