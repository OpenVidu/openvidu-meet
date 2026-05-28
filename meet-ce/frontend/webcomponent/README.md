OpenVidu Meet Web Component (Angular)
======================================

This package provides the `<openvidu-meet>` custom element built with Angular Elements. It renders the meeting UI directly into the host application's DOM — without an iframe — and exposes a rich, type-safe public API.

## Architecture

```
webcomponent-new/
├── contracts/
│   └── openvidu-meet.contract.js   ← Single source of truth for the public API
├── scripts/
│   ├── generate-api.js             ← Orchestrates all generators
│   ├── concat-wc.js                ← Concatenates Angular build output
│   └── generators/
│       ├── generate-types.js       ← TypeScript declarations
│       ├── generate-cem.js         ← Custom Elements Manifest
│       ├── generate-angular-wrapper.js
│       └── generate-react-wrapper.js
└── src/
    ├── main.ts                     ← Dev entry point (full Angular app)
    ├── main.wc.ts                  ← WC build entry point
    └── app/
        ├── app.ts                  ← Root Angular component (exposes WC API)
        ├── app.module.ts           ← Custom element registration
        └── components/             ← UI sub-components
```

## Quick Start

### Development

```bash
npm install
npm start          # Angular dev server at http://localhost:4200
```

### Build the WebComponent bundle

```bash
npm run build:wc:bundle   # compiles Angular → concatenates → generates API artifacts
```

Output:
- `dist/openvidu-meet-wc.js` — single-file bundle ready to embed
- `dist/types/openvidu-meet.d.ts` — framework-agnostic TypeScript declarations
- `dist/types/openvidu-meet-react-jsx.d.ts` — React JSX type augmentations
- `dist/custom-elements.json` — Custom Elements Manifest
- `dist/wrappers/angular/` — typed Angular wrapper component
- `dist/wrappers/react/` — typed React wrapper component

### Regenerate API artifacts only (no Angular build)

```bash
npm run build:api
```

## Contract-first API design

All public API artifacts are derived from a single contract file:

```
contracts/openvidu-meet.contract.js
```

Edit the contract → run `npm run build:api` to regenerate all integration artifacts.

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

  meet.addEventListener('joined', (e) => {
    console.log('Joined room:', e.detail.roomId, 'as', e.detail.participantIdentity);
  });

  meet.addEventListener('left', (e) => {
    console.log('Left room, reason:', e.detail.reason);
  });

  // Imperative API
  // meet.endMeeting();
  // meet.leaveRoom();
  // meet.kickParticipant('participant-id');
</script>
```

## TypeScript support

```typescript
import type { OpenViduMeetElement, OpenViduMeetJoinedDetail } from 'dist/types/openvidu-meet';

const meet = document.querySelector<OpenViduMeetElement>('openvidu-meet')!;

meet.addEventListener('joined', (e: CustomEvent<OpenViduMeetJoinedDetail>) => {
  console.log(e.detail.roomId);
});

meet.roomUrl = 'https://your-server.com/room/my-room';
meet.participantName = 'Alice';
```
