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

**Audience and altitude.** The readers are developers, integrators and administrators. An entry says what
Meet can do now or does differently, in terms of the capability, not of the commits, files or classes
behind it. Concise and natural technical English; never invent behaviour the change does not show.

- **Group by functional area, not by change.** Related changes are one bullet: a feature, however many
  commits or surfaces it took, is one entry, and a capability that reaches the REST API and the embedded
  API names both in that entry. Split entries dissolve a headline feature into a list.
- **One or two lines per bullet**, in the present tense, opening with a bold functional label
  (`**Live broadcasting:**`). What changed, not why, not how it behaves, not what the reader should do
  about it.
- **Name the contract, but only its representative part.** Name the identifiers a reader searches for
  (endpoints, configuration fields, environment variables, commands, events, attributes, permissions,
  enum values), but never list every command or event of a feature: name the most representative ones and
  link the reference for the rest.
- **No implementation detail.** No internal methods, private variables, services, storage layout or
  minor technical changes that tell a reader nothing they can use. A permission belongs in the entry that
  uses it, never in an entry of its own, so the reader never meets a permission before the thing it
  gates.
- **Never drop what a reader has to act on or trust**: a security, authorization, compatibility or
  deployment implication is stated, and a change that needs administrator action or a configuration
  update goes in `Upgrade notes` or `Deployment`.
- **Say each thing once.** Information given in one section is not repeated in another.
- **Order the entries of a subsection by feature**, so the list does not jump between unrelated
  ones and never mentions something it explains later.
- **No recommendations.** No `must`, no `should`, no second person. A remedy is stated as a fact:
  "the unchanged object is accepted", never "echo the object back unchanged".
- **No API reference.** Endpoint tables, payload fields, status semantics and enum meanings live
  in `meet-ce/backend/openapi/` and in the typings TSDoc, which generate the published docs. Link
  them instead of restating them, and keep the links already in the file.
- **Say what actually gates a capability**: the permission the server checks, not the role that
  usually holds it. Check the route and the service before writing it.
- **`Improved`** states the new behaviour of something that existed and the contract that changed, not the
  minor adjustments individually.
- **`Fixed`** groups related fixes by functional area into one bullet, and does not list each edge case
  when a broader description is accurate. Security, authorization, data integrity and stability come
  first. A bullet says what was wrong and then what is true now, in one or two sentences. No story of the
  bug, no consequences, no rationale: that belongs in the commit message.
- **`UI`** describes what a person can now do or sees, grouped by area. Layout, interaction and styling
  adjustments are not listed one by one.
- **`Deployment`** keeps the configuration and environment variable names and the practical consequence.
- Tables only for mappings, such as a deprecated name to its replacement.

Links to the REST API reference are markdown reference-style definitions collected at the end of
the file, labelled with the release (`[3.9-meetings]`) because the published URL is version-pinned
to `https://openvidu.io/<version>/meet/embedded/reference/api.html`. Anchors follow the convention
the OpenAPI sources already use for their own cross-references: `#/operations/<operationId>`,
`#/webhooks/<operationId>` and `#/schemas/<Schema>`.
