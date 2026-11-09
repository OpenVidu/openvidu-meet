# Tasks

## 1. Record the residual

- [ ] 1.1 In `openspec/changes/add-live-broadcast/design.md`, section "Destinations where no RTMP server can live", add the residual: the guard resolves the host when the request arrives and the egress resolves it again when it connects, so a rebinding host passes; the complete guard belongs to the egress, which checks the address it connects to.
- [ ] 1.2 Update requirement "Destinations where no RTMP server can live" of `openspec/changes/add-live-broadcast/specs/live-broadcast/spec.md` so it says the check is made on the host as it resolves when the request is answered, instead of promising the media server never streams to its own host. If `add-live-broadcast` is already archived, write a `MODIFIED` delta in this change and drop `skip_specs`.

## 2. Close it in the egress

- [ ] 2.1 Open the issue or patch in the egress fork (OpenVidu/egress) refusing loopback, link-local, unspecified, multicast and broadcast addresses at connect time. Verify with a rebinding test host against the patched egress (report as not run when unavailable).

## 3. Release surfaces

- [ ] 3.1 `CHANGELOG.md`: none. Live broadcast (#120) is new in 3.10.0 and unreleased, so its fixes get no line of their own.
- [ ] 3.2 openvidu.io: none.
