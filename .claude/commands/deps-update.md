---
description: Update the dependencies of the workspace, all of them or the ones named, in their own worktree and pull request
argument-hint: '[package[@version] ...]'
disable-model-invocation: true
---

Update dependencies of OpenVidu Meet in isolation: their own worktree, their own branch and their own
draft pull request, with nothing else in it.

Requested: `$ARGUMENTS`

## Scope

- **No argument**: every dependency of the workspace that has a newer patch or minor release
  (`pnpm outdated -r` lists them). A newer major is not taken: it goes in the report with what it breaks.
- **Packages named**: only those, to the version given (`name@version`) or to their latest stable release,
  a major included, because naming the package is the decision to take it. A package that must move with
  a named one moves too (the `@angular/*` set, a library and its `@types`, a peer it requires) and the
  report says so. A name that matches no dependency of the workspace stops the command with the closest
  names.
- The holds of `.claude/agents/dependency-updater.md` (TypeScript 7, pnpm 12, the `livekit-client` fork)
  stand even when the package is named: say why it is held and what would lift the hold, and take the rest.

## Steps

1. Work in a new worktree from `origin/main` (`.claude/rules/worktrees.md`), on a branch `build/deps-<date>`
   or `build/deps-<package>`, and run `./meet.sh install` there. A worktree has no `meet-pro/`, which is
   what a lockfile change needs.
2. Hand the scope to the `dependency-updater` agent with the absolute path of the worktree. It reads what
   changed in each package over the versions it crosses (Context7, then the release notes of the
   package), moves the manifests and the lockfile together, and returns its proof.
3. Check its report against the diff: only the packages in scope moved, the lockfile changed with the
   manifests, `./meet.sh verify --all` and `./meet.sh build --skip-install` pass. Fix what an upgrade
   broke in the same branch; a fix that changes what a user can observe is not a dependency update, so
   stop and say so.
4. Commit the manifests and the lockfile together (`build(deps): ...`), push and open a draft pull
   request. A lockfile change selects every CI suite, and those whole suites are the proof of a
   dependency update: `./meet.sh affected` has nothing to narrow.
5. Report: the packages moved (from, to, the change worth knowing in each), the ones held or left at a
   major with the reason, the pull request, and the `node scripts/dev/pro-deps.mjs --fix` to run in the
   checkout that has `meet-pro/`.
