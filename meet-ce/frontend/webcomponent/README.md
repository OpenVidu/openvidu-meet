OpenVidu Meet Web Component (Angular)
======================================

This package provides the `<openvidu-meet>` custom element built with Angular Elements. It renders the meeting UI directly into the host application's DOM — without an iframe — and exposes a public API (attributes, events, imperative methods).

## Architecture

```
webcomponent/
├── scripts/
│   ├── concat-wc.js            ← Bundles the Angular build into a single file
│   ├── deploy-to-backend.js    ← Copies the bundle into the backend's public dir
│   └── dev.js                  ← Watch build + testapp (ng serve)
└── src/
    ├── main.ts                 ← Dev entry point (full Angular app)
    ├── main.wc.ts              ← WC build entry point
    └── app/                    ← Root component, custom-element registration, UI
```

## Quick Start

### Development

```bash
npm install
npm start          # Angular dev server at http://localhost:4200
```

### Build the WebComponent bundle

```bash
npm run build:wc:bundle   # compiles Angular → concatenates → deploys to the backend
```

Output:
- `dist/openvidu-meet-wc.js` — single-file bundle ready to embed. The build also
  deploys it into the backend's public dir, which serves it at
  `<basePath>/v1/openvidu-meet.js`.

The bundle is the only published artifact: host apps embed `<openvidu-meet>` by
loading this script. (The contract-driven generators, framework wrappers, and
generated type/manifest artifacts were removed in favor of this single deliverable.)

## Embedding in host applications

### Vanilla HTML

```html
<script src="/openvidu-meet-wc.js"></script>

<openvidu-meet room-url="https://your-server.com/room/my-room">
  <!-- Optional: replace the toolbar -->
  <nav slot="toolbar">My Custom Toolbar</nav>

  <!-- Optional: add a side panel -->
  <aside slot="side">Custom sidebar content</aside>

  <!-- Optional: inject content into the layout slot -->
  <div slot="layout">
    <!-- Elements with slot="participant-{id}" receive injected VideoTile components -->
    <div slot="participant-abc123"></div>
  </div>
</openvidu-meet>

<script>
  const meet = document.querySelector('openvidu-meet');

  meet.addEventListener('meetingJoined', (e) => {
    console.log('Joined room:', e.detail.roomId, 'as', e.detail.participantIdentity);
  });

  meet.addEventListener('meetingLeft', (e) => {
    console.log('Left room, reason:', e.detail.reason);
  });

  // Remote participants (live transitions only; the local participant uses the
  // meeting* events above). The participant object carries the identity, the
  // app-provided externalId/metadata correlation fields and the effective role.
  meet.addEventListener('participantJoined', (e) => {
    console.log('Participant joined:', e.detail.participant.participantName, e.detail.participant.externalId);
  });

  meet.addEventListener('participantLeft', (e) => {
    console.log('Participant left:', e.detail.participant.participantIdentity);
  });

  // The 3.8.0 event names ('joined', 'left', 'closed') are dispatched alongside the
  // canonical ones above until 3.12.0 — listening to both delivers the event twice.

  // Imperative API
  // meet.meetingEnd();
  // meet.meetingLeave();
  // meet.participantKick('participant-id');

  // The 3.8.0 spellings still work — they forward to the canonical method above —
  // but are deprecated and removed in 3.12.0: meet.endMeeting() / meet.leaveRoom() /
  // meet.kickParticipant('participant-id')
</script>
```

## TypeScript support

The bundle ships no `.d.ts`. A TypeScript host declares the subset of the element
API it uses (see `testapp/src/app/openvidu-meet-element.ts` for a working example):

```typescript
interface OpenViduMeetElement extends HTMLElement {
  roomUrl?: string;
  participantName?: string;
  meetingEnd(): void;
  meetingLeave(): void;
  participantKick(participantIdentity: string): void;
}

const meet = document.querySelector<OpenViduMeetElement>('openvidu-meet')!;
meet.addEventListener('meetingJoined', (e) => console.log((e as CustomEvent).detail.roomId));
meet.roomUrl = 'https://your-server.com/room/my-room';
```

The 3.8.0 method names (`endMeeting()`, `leaveRoom()`, `kickParticipant()`) are kept as
`@deprecated` aliases that forward to the canonical method above, removed in **3.12.0**. New
integrations should declare and call the canonical names only.
