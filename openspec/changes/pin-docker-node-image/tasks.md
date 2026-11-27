# Tasks

## 1. Pin the production stage

- [ ] 1.1 In `meet-ce/docker/Dockerfile` change the production `FROM node:24-slim` to the `slim` variant of the exact version the other stages pin (never an Alpine variant: the backend's `@livekit/rtc-node` binding needs glibc). Verify that the three stages and `.github/workflows/ci.yaml` name the same version (`grep -n '24\.' meet-ce/docker/Dockerfile .github/workflows/ci.yaml`) and that the image still builds (`docker build`, report as not run when Docker is unavailable).

## 2. Release surfaces

- [ ] 2.1 `CHANGELOG.md`: none (build change without a different behavior).
- [ ] 2.2 openvidu.io: none.
