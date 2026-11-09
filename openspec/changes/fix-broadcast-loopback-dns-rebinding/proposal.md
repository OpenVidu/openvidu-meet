# Proposal

## Why

The server refuses destinations that point at the media server itself or at the cloud metadata address,
but it checks the name only when the request arrives. A host name that answers a public address to Meet
and a loopback or link-local address to the egress, a moment later, gets the stream pushed to the
node's own ports, and the error text then shows which ports are open.

## What Changes

- Meet cannot close this alone, so the residual is stated: requirement "Destinations where no RTMP server
  can live" of `add-live-broadcast` says the check holds at request time, and the design's section of
  the same name lists the rebinding case as a known residual.
- The real fix, checking the address the egress connects to, is requested in the egress fork; this change
  tracks it and does not change Meet code.
- No delta of its own: `live-broadcast` is still being added by `add-live-broadcast`.

## Capabilities

### New Capabilities

None.

### Modified Capabilities

None (`skip_specs: true`). Tasks update the requirement and the design of `add-live-broadcast`.

## Impact

- REST API, webhooks, embedded API, UIs, deployment configuration: not affected.
- Documentation of the in-flight change only, plus an issue or patch in the egress fork.
- openvidu.io: none (the page does not promise the guard).

## Decisions to confirm

- Delivery: private advisory or regular public pull request.
- How the residual is closed. Proposed: document it now and patch the egress fork to refuse
  loopback, link-local, unspecified, multicast and broadcast addresses at connect time. Alternative:
  accept it, since it needs a moderator link and a controlled DNS name, and the oracle is limited to an
  error text. Alternative: operators block egress traffic to those ranges at the network level.

## Source

3.10.0 pre-release audit, finding BB-8 (low, static-plausible), introduced by #120.
