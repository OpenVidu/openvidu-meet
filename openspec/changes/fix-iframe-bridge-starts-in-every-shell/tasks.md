# Tasks

## 1. One provider for the bridge

- [ ] 1.1 Export `provideEmbeddedIframeBridge()` from `shared-meet-components` (`domains/embedded`, public API file), wrapping the app initializer that calls `IframeBridgeService.initialize()`, and use it in `meet-ce/frontend/src/app/app.config.ts` in place of the inline initializer. Verify with a unit spec of the provider (the bridge initializes at bootstrap) and the existing iframe e2e cases still passing (needs the testapp; report as not run when unavailable).
- [ ] 1.2 Document the provider in `meet-ce/frontend/CLAUDE.md` where the shell composition is described, so a shell built on the library lists it.

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none. Internal seam, no change a user or integrator observes in CE.
- [ ] 2.2 openvidu.io: none.
