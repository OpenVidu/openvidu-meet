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
   package), moves the manifests and the lockfile together, adapts the code to the new versions (the
   migrations a package ships, what it breaks, the APIs it deprecates) and proves that everything builds
   and the unit suites pass.
3. Check its report against the diff and rerun its proof (`./meet.sh build --skip-install`, then
   `./meet.sh verify --all`): only the packages in scope moved, the lockfile changed with the manifests,
   and every code change follows from an upgrade the report names. A behavior change it stopped on is not
   a dependency update: bring it to the user with the options before going on.
4. Commit the manifests, the lockfile and the adapted code together (`build(deps): ...`), push and open a
   draft pull request: a lockfile change selects every CI suite, and those whole suites are the rest of
   the proof.
5. Report: the packages moved (from, to, the change worth knowing in each), the code adapted, the ones
   held or left at a major with the reason, the opportunities the new versions open, the pull request,
   and the `node scripts/dev/pro-deps.mjs --fix` to run in the checkout that has `meet-pro/`.
