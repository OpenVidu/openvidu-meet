---
paths:
    - 'CHANGELOG.md'
---

# Changelog rules

`CHANGELOG.md` at the root, newest release first. **Review it on every commit and every PR**: a
change a user or an integrator can observe gets its line in the unreleased release in the same
commit that makes it. Internal refactors, tests and build work do not.

**Documentation-only changes never get a line**, however visible the document is: correcting the
OpenAPI, a TSDoc or a website page so it finally describes behaviour the server already had changes
nothing a reader can observe in the product. The changelog records what the software does
differently, not what we finally wrote down about it. The same goes for a fix to a feature of the
unreleased version itself: there is no previous release it differs from, so it belongs to that
feature's existing entry, not to a `Fixed` line of its own.

A release uses these sections, in this order, omitting the empty ones:

`Upgrade notes` → `Breaking changes` → `Deprecated` → `Added` → `Improved` → `Fixed`

`Added`, `Improved` and `Fixed` group their entries under `Integration`, `UI` and `Deployment`,
defined once at the top of the file: the surfaces a host application is built against, what a
person using Meet sees, and running the server.

- **One line per change**, in the present tense. What changed, not why, not how it behaves, not
  what the reader should do about it.
- **One entry per feature, not per surface.** A capability that reaches the REST API and the
  embedded API is one line naming both, never one line each: split entries dissolve a headline
  feature into a list. A permission belongs in the entry that uses it, never in an entry of its
  own, so the reader never meets a permission before the thing it gates.
- **Order the entries of a subsection by feature**, so the list does not jump between unrelated
  ones and never mentions something it explains later.
- **No recommendations.** No `must`, no `should`, no second person. A remedy is stated as a fact:
  "the unchanged object is accepted", never "echo the object back unchanged".
- **No API reference.** Endpoint tables, payload fields, status semantics and enum meanings live
  in `meet-ce/backend/openapi/` and in the typings TSDoc, which generate the published docs. Link
  them instead of restating them.
- **Name the identifiers that changed**: endpoints, configuration fields, commands, events,
  permissions, enum values. That is what a reader searches for.
- **Say what actually gates a capability**: the permission the server checks, not the role that
  usually holds it. Check the route and the service before writing it.
- **A fix says what was wrong and then what is true now**, in one or two sentences. No story of
  the bug, no consequences, no rationale: that belongs in the commit message.
- Tables only for mappings, such as a deprecated name to its replacement.

Links to the REST API reference are markdown reference-style definitions collected at the end of
the file, labelled with the release (`[3.9-meetings]`) because the published URL is version-pinned
to `https://openvidu.io/<version>/meet/embedded/reference/api.html`. Anchors follow the convention
the OpenAPI sources already use for their own cross-references: `#/operations/<operationId>`,
`#/webhooks/<operationId>` and `#/schemas/<Schema>`.
