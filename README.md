# OpenVidu Meet

OpenVidu Meet is a fully featured, self-hosted video conferencing application: a ready-to-use alternative to Zoom, Google Meet or Jitsi Meet that runs on your own servers and needs no code to deploy. It is built with Angular, Node.js and [LiveKit](https://livekit.io/), ships as part of an OpenVidu deployment, and provides user accounts and login, granular roles and per-room permissions, room management, recordings, analytics and webhooks.

It can also be **embedded** into third-party web applications — either as the `<openvidu-meet>` web component or inside an `<iframe>` — so the host application can build its own business layer on top of the meeting.

This repository contains the **Community Edition (CE)**. The **Professional Edition (PRO)** lives in a separate private repository and extends CE rather than forking it.

## Prerequisites

- **Node.js** `24.15.0` or later.
- **pnpm** `11.8.0` (pinned by `packageManager` in `package.json`). `./meet.sh` offers to install it if it is missing.
- **Backing services** (LiveKit, MongoDB, Redis and S3-compatible storage). The simplest way to run them is the [OpenVidu local deployment](https://github.com/OpenVidu/openvidu-local-deployment), which the backend defaults already match.

> [!TIP]
> Disable the `openvidu-meet` container of the local deployment so your local build is the one being used.

## Getting Started

```bash
git clone https://github.com/OpenVidu/openvidu-meet.git
cd openvidu-meet
./meet.sh dev
```

The application is available at [http://localhost:6080/meet](http://localhost:6080/meet) (log in with `admin` / `admin`), and the REST API documentation at [http://localhost:6080/meet/api/v1/docs](http://localhost:6080/meet/api/v1/docs).

`./meet.sh dev` runs every watcher with hot reload. Add `--testapp` to also start the embedding test application on `:5080` (webhook bridge on `:5081`) and rebuild the web component bundle it loads.

To change the configuration, override variables in `meet-ce/backend/.env.dev`. The full list, with defaults, is in [meet-ce/backend/src/environment.ts](meet-ce/backend/src/environment.ts).

`./meet.sh help` lists every command.

## Repository Layout

| Package                                            | Role |
| -------------------------------------------------- | ---- |
| `meet-ce/typings`                                  | TypeScript contracts shared by backend, frontend and embedding API |
| `meet-ce/backend`                                  | Node.js + Express REST API; also serves the built frontend and the web component bundle |
| `meet-ce/frontend`                                 | Angular application shell |
| `meet-ce/frontend/projects/shared-meet-components` | Angular library holding all UI logic, organized by domain |
| `meet-ce/frontend/webcomponent`                    | The `<openvidu-meet>` custom element |
| `testapp`                                          | Host application used to validate the web component and iframe integrations |

Each package has a `CLAUDE.md` describing its architecture, conventions and pitfalls. They are written for AI coding agents, but are useful to new contributors too.

## Building and Testing

```bash
./meet.sh build                    # Full build, in dependency order

./meet.sh test-unit-backend        # Jest
./meet.sh test-unit-frontend       # Karma (shared-meet-components)
./meet.sh test-unit-webcomponent   # Jest

./meet.sh lint-backend
./meet.sh lint-frontend
./meet.sh lint-webcomponent

./meet.sh test-e2e-frontend        # Playwright, SPA
./meet.sh test-e2e-webcomponent    # Playwright, web component (needs ./meet.sh start-testapp)
```

Unit tests and linting need no backing services. Backend integration tests (`pnpm run test:integration-backend`) and the Playwright suites need the local deployment running.

## Deployment

See the [OpenVidu Meet deployment guide](https://openvidu.io/latest/meet/deployment/overview/).

## Contributing

Contributions are welcome. Before opening a pull request, make sure that:

1. Unit tests and linting pass.
2. Code is formatted with Prettier (`.prettierrc`).
3. Shared types live in `meet-ce/typings/` and new or changed endpoints are reflected in `meet-ce/backend/openapi/`.
4. Any change visible to users or integrators has its line in [CHANGELOG.md](CHANGELOG.md).

## License

Licensed under the Apache License, Version 2.0. See [LICENSE](LICENSE) for details.

## Links

- [OpenVidu Website](https://openvidu.io/)
- [OpenVidu Meet documentation](https://openvidu.io/latest/meet/)
- [Community forum](https://openvidu.discourse.group/)
