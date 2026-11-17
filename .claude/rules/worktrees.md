---
description: Working in a git worktree of this repository
---

# Worktrees

Every change is made in its own git worktree (`.claude/worktrees/<name>`, branched from `origin/main`),
so the main checkout and the sessions that share it are never switched to another branch.

- A new worktree has no `node_modules` and no built typings: run `./meet.sh install` first. Until it
  ends `npx openspec`, `./meet.sh verify` and every suite fail, and `./meet.sh doctor` says so on its
  `dependencies` line. `meet-pro/` is not there either, which is what a dependency change needs (root
  `CLAUDE.md`, Edition model).
- Run each command from the worktree root, one simple command per call: a session inside a worktree
  refuses a command it cannot prove stays in the worktree (several commands chained, a `cd` into a
  subfolder, a path of the main checkout). When a wrapper around `git` is refused, call `/usr/bin/git`.
- The main checkout is `../../..` from the worktree, so the sibling checkouts the docs name by a
  relative path are not where a relative path says: openvidu.io is `<main checkout>/../openvidu.io`.
  Pass its absolute path to `./meet.sh build-webcomponent-doc` and `build-rest-api-doc`.
- The local deployment, the stack registry and ports are shared by every worktree: take your own
  resources with `./meet.sh stack up <name>`, never stop a process another checkout started
  (`./meet.sh stack list` and `./meet.sh doctor` say who runs what), and `stack down` yours at the end.
- An agent briefed to work in a worktree is given its absolute path and works only there. Agents do not
  commit; the main session stages by explicit path and commits.
