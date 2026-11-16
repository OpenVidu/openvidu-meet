---
paths:
    - 'scripts/dev/**'
    - 'meet.sh'
    - '**/nodemon*.json'
---

# Development mode mechanics

`./meet.sh dev` runs watchers under `concurrently` (typings, REST API docs, backend, frontend). The
CE frontend compiles the library from source, so there is no library watcher; PRO adds one because
it consumes the library's `dist`. Two details matter when things look stale:

- The typings watcher writes `meet-ce/typings/dist/typings-ready.flag`; every other watcher runs
  behind `scripts/dev/watch-with-typings-guard.mjs`, which waits for that flag and restarts its
  child when typings recompile. A typings compile error therefore stalls the other watchers by
  design.
- The frontend `ng build --watch` writes **directly into `meet-ce/backend/public/frontend`**, and
  the webcomponent build deploys into `meet-ce/backend/public/webcomponent`. The backend serves
  those directories. `public/` is git-ignored; a stale bundle there is the usual cause of "my change
  isn't showing up"; rebuild rather than debugging the running app.
